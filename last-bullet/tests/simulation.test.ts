import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GameSession } from '../src/core/GameSession.ts';
import { GameWorld } from '../src/core/GameWorld.ts';
import { FrameClock } from '../src/adapters/clock/FrameClock.ts';
import { RandomAdapter } from '../src/adapters/random/RandomAdapter.ts';
import {
  BULLET_CAP,
  ENEMY_CAP,
  FIXED_STEP,
} from '../src/core/config.ts';
import type { InputPort, JoystickView } from '../src/ports/InputPort.ts';
import type { KeyState, KeyboardPort } from '../src/ports/KeyboardPort.ts';
import type { PointerPort } from '../src/ports/PointerPort.ts';
import type {
  LevelUpEvent,
  RunEndedEvent,
  UpgradeId,
  Vec2,
  WorldEventsPort,
  WorldFrame,
} from '../src/core/types.ts';
import { IDLE, engage } from './support/survivor.ts';

/** Roomy arena where a competent survivor can kite for a while. */
const ARENA = { w: 700, h: 1400 };

/** One fixed step, expressed the way a scene reports a frame to the session. */
const FRAME_MS = FIXED_STEP * 1000;
/** Long enough for a run to reach the Result Panel, or for a budget to bite. */
const RUN_BUDGET = 30 * 240;
/** A short, fixed window: enough samples to fingerprint a run by. */
const FINGERPRINT_FRAMES = 600;

/**
 * Simulation budgets, in milliseconds of CPU per frame pumped through the
 * session.
 *
 * A frame owns a whole 33.3 ms of wall clock before the game drops below its
 * 30 FPS floor, and a measured step currently costs about 0.02 ms even with
 * the pool at its 120-zombie cap. These limits are therefore generous: they
 * are there to catch an accidental O(n^2) creeping back into a hot loop, not
 * to time the machine.
 */
const MEAN_STEP_BUDGET_MS = 0.5;
const WORST_STEP_BUDGET_MS = 16;

/** Records everything the world reports; the renderer's stand-in. */
class Recorder implements WorldEventsPort {
  readonly ends: RunEndedEvent[] = [];
  readonly levelUps: LevelUpEvent[] = [];
  kills = 0;
  hits = 0;
  shots = 0;
  pickups = 0;
  choices: UpgradeId[] = [];

  onRunEnded(event: RunEndedEvent): void { this.ends.push(event); }
  onLevelUp(event: LevelUpEvent): void { this.levelUps.push(event); }
  onEnemyKilled(): void { this.kills += 1; }
  onPlayerHit(): void { this.hits += 1; }
  onBulletFired(): void { this.shots += 1; }
  onBulletPickedUp(): void { this.pickups += 1; }
  onExplosion(): void { /* the renderer's business */ }
  onUpgradeChosen(event: { id: UpgradeId }): void { this.choices.push(event.id); }
}

/**
 * The scripted player, plugged in exactly where the `Game` scene plugs in its
 * thumb: the driver samples it once per frame and hands the same vector to
 * every step of that frame.
 */
class ScriptedInput implements InputPort {
  private readonly move: Vec2 = { x: 0, y: 0 };
  private readonly stick: JoystickView = {
    active: false,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
  };
  private readonly read: () => GameSession;
  private readonly policy: (frame: WorldFrame) => Vec2;

  constructor(read: () => GameSession, policy: (frame: WorldFrame) => Vec2) {
    this.read = read;
    this.policy = policy;
  }

  getMove(): Vec2 {
    const intent = this.policy(this.read().render.getFrame());
    this.move.x = intent.x;
    this.move.y = intent.y;
    return this.move;
  }

  getStick(): JoystickView {
    return this.stick;
  }
}

/** Nobody touches the screen in a headless round. */
class StillPointer implements PointerPort {
  down(_pointerId: number, _x: number, _y: number): void { /* no thumb */ }
  move(_pointerId: number, _x: number, _y: number): void { /* no thumb */ }
  up(_pointerId: number): void { /* no thumb */ }
  releaseAll(): void { /* nothing to drop */ }
}

/** And nobody touches the keyboard either. */
class StillKeyboard implements KeyboardPort {
  setHeld(_state: KeyState): void { /* no keys */ }
}

/** FNV-1a over the sampled frames: a short, comparable run fingerprint. */
class Fingerprint {
  private hash = 0x811c9dc5;

  add(value: number): void {
    // Quantised to four decimals: two runs must agree on the digits a
    // simulation can actually reproduce, not on the last bit of a root.
    const text = `${value.toFixed(4)},`;
    for (let i = 0; i < text.length; i++) {
      this.hash ^= text.charCodeAt(i);
      this.hash = Math.imul(this.hash, 0x01000193) >>> 0;
    }
  }

  toString(): string {
    return (this.hash >>> 0).toString(16).padStart(8, '0');
  }
}

interface RoundResult {
  readonly session: GameSession;
  readonly world: GameWorld;
  readonly events: Recorder;
  readonly frames: number;
  readonly levelUps: number;
  readonly peak: { enemies: number; bullets: number };
  readonly meanStepMs: number;
  readonly worstStepMs: number;
  readonly fingerprint: string;
  readonly final: {
    win: boolean;
    running: boolean;
    score: number;
    kills: number;
    level: number;
    wave: number;
    hp: number;
    time: number;
  };
}

interface RoundOptions {
  readonly view?: { w: number; h: number };
  readonly move?: (frame: WorldFrame) => Vec2;
  readonly frames?: number;
}

/**
 * Plays a run headless: one `session.frame()` per rendered frame, cards tapped
 * the instant they appear, clock fed one fixed step at a time - the same call
 * sequence the `Game` scene makes. Stops at the Result Panel or at the frame
 * budget, whichever comes first.
 */
const playRound = (seed: number, options: RoundOptions = {}): RoundResult => {
  const view = options.view ?? ARENA;
  const move = options.move ?? engage;
  const budget = options.frames ?? RUN_BUDGET;

  const events = new Recorder();
  const world = new GameWorld(new RandomAdapter(seed), events);
  world.setViewSize(view.w, view.h);

  let session!: GameSession;
  const input = new ScriptedInput(() => session, move);
  session = new GameSession(world, new FrameClock(), input, new StillPointer(), new StillKeyboard());

  const fingerprint = new Fingerprint();
  const peak = { enemies: 0, bullets: 0 };

  let frames = 0;
  let meanStepMs = 0;
  let worstStepMs = 0;

  for (let i = 0; i < budget; i++) {
    const frame = session.render.getFrame();
    if (!frame.running) break;

    // A card is on offer: the player taps one. The simulation is frozen until
    // they do, which the dedicated test below pins down.
    if (frame.offers !== null) {
      assert.equal(
        session.upgrades.choose(frame.offers[0]),
        true,
        'a card on offer can always be taken',
      );
      continue;
    }

    const started = performance.now();
    session.frame(FRAME_MS);
    const cost = performance.now() - started;

    meanStepMs += (cost - meanStepMs) / (frames + 1);
    if (cost > worstStepMs) worstStepMs = cost;
    frames += 1;

    const counts = world.counts();
    peak.enemies = Math.max(peak.enemies, counts.enemies);
    peak.bullets = Math.max(peak.bullets, counts.bullets);

    fingerprint.add(frame.time);
    fingerprint.add(frame.player.x);
    fingerprint.add(frame.player.y);
    fingerprint.add(frame.score);
    fingerprint.add(frame.wave);
    fingerprint.add(counts.enemies);
  }

  const end = session.render.getFrame();
  return {
    session,
    world,
    events,
    frames,
    levelUps: events.levelUps.length,
    peak,
    meanStepMs,
    worstStepMs,
    fingerprint: fingerprint.toString(),
    final: {
      win: end.win,
      running: end.running,
      score: end.score,
      kills: end.kills,
      level: end.level,
      wave: end.wave,
      hp: end.player.hp,
      time: end.time,
    },
  };
};

// ---------------------------------------------------------------------------

describe('a run played headless', () => {
  test('falls after the waves overwhelm it, reporting exactly once', () => {
    // Nobody steers, so wave 1 walks straight into the player.
    const round = playRound(9, { move: () => IDLE });
    const { events } = round;

    assert.ok(round.frames > 0, 'the run actually stepped');
    assert.equal(round.world.getFrame().running, false, 'and then it ended');
    assert.equal(events.ends.length, 1, 'exactly one endRound per run');
    assert.equal(round.final.running, false);
    assert.equal(round.final.win, true, 'an endless run only ever ends by death');
    assert.equal(round.final.hp, 0);
    assert.equal(round.world.frozen(), true, 'a finished run may not be stepped');

    assert.ok(round.peak.enemies <= ENEMY_CAP, `enemies peaked at ${round.peak.enemies}`);
    assert.ok(round.peak.bullets <= BULLET_CAP, `bullets peaked at ${round.peak.bullets}`);

    assert.equal(
      round.world.getFrame().score,
      events.ends[0].score,
      'panel score and reported score are the same number',
    );
  });

  test('a fought run earns kills, levels and re-armed bullets', () => {
    const round = playRound(9, { frames: RUN_BUDGET });

    assert.ok(round.peak.enemies > 0, 'the waves really did spawn somebody');
    assert.ok(round.events.kills >= 5, `the survivor fought back (${round.events.kills} kills)`);
    assert.ok(round.levelUps >= 1, 'and reached level 2');
    assert.equal(
      round.events.choices.length,
      round.levelUps,
      'every level-up is answered exactly once',
    );
    assert.ok(round.events.shots > 0 && round.events.pickups > 0, 'it re-armed its bullet');
    assert.ok(round.final.wave >= 1);
    assert.ok(round.final.score >= 100, 'clearing waves is where most of the score comes from');
  });

  test('the same seed replays the same run, a different seed does not', () => {
    const first = playRound(9, { frames: FINGERPRINT_FRAMES });
    const second = playRound(9, { frames: FINGERPRINT_FRAMES });
    const other = playRound(10, { frames: FINGERPRINT_FRAMES });

    assert.equal(
      first.fingerprint,
      second.fingerprint,
      'a seeded run must be reproducible frame for frame',
    );
    assert.deepEqual(first.final, second.final, 'and so must its result');
    assert.deepEqual(first.events.choices, second.events.choices);

    // The fingerprint samples positions, wave, score and pool size every frame,
    // so two different seeds cannot agree on it even when twenty seconds of
    // scripted play happen to end in the same shape.
    assert.notEqual(
      first.fingerprint,
      other.fingerprint,
      'a different seed must play a different run',
    );
  });

  test('no time banks up behind the level-up overlay', () => {
    const events = new Recorder();
    const world = new GameWorld(new RandomAdapter(9), events);
    world.setViewSize(ARENA.w, ARENA.h);

    let session!: GameSession;
    const input = new ScriptedInput(() => session, engage);
    session = new GameSession(world, new FrameClock(), input, new StillPointer(), new StillKeyboard());

    let guard = 0;
    while (guard++ < RUN_BUDGET) {
      const frame = session.render.getFrame();
      if (frame.offers !== null) break;
      if (!frame.running) break;
      session.frame(FRAME_MS);
    }

    const frozen = session.render.getFrame();
    assert.ok(frozen.offers, 'the survivor does level up');
    const frozenAt = frozen.time;

    // The scene keeps calling `frame` while the overlay is up - the session
    // must ignore every one of those calls rather than draining the clock.
    for (let i = 0; i < 30; i++) session.frame(FRAME_MS * 10);
    assert.equal(session.render.getFrame().time, frozenAt, 'the clock is not read while frozen');
    assert.equal(world.getFrame().offers?.length, frozen.offers.length, 'and the cards stay up');

    assert.equal(session.upgrades.choose(frozen.offers[0]), true);
    assert.equal(session.render.getFrame().offers, null);

    session.frame(FRAME_MS);
    const resumed = session.render.getFrame().time;
    assert.ok(
      resumed > frozenAt && resumed - frozenAt <= FIXED_STEP + 1e-9,
      `at most one step of banked time, saw ${(resumed - frozenAt).toExponential(2)} s`,
    );
  });
});

describe('the simulation budget', () => {
  test('a full 120-zombie wave holds the pool at its cap inside the budget', () => {
    const events = new Recorder();
    const world = new GameWorld(new RandomAdapter(9), events);
    world.setViewSize(ARENA.w, ARENA.h);

    let session!: GameSession;
    const input = new ScriptedInput(() => session, engage);
    session = new GameSession(world, new FrameClock(), input, new StillPointer(), new StillKeyboard());

    // One frame so wave 1 exists, then ring the pool out to the cap: the cost
    // of a worst-case wave without first playing thirty waves to reach it.
    session.frame(FRAME_MS);
    const seeded = world.seedRing(ENEMY_CAP - world.counts().enemies);
    assert.equal(
      world.counts().enemies,
      ENEMY_CAP,
      `the ring fills the pool (${seeded} seeded, plus wave 1)`,
    );

    const fingerprint = new Fingerprint();
    let frames = 0;
    let meanStepMs = 0;
    let worstStepMs = 0;

    // The horde closes in and the run ends on its own; either way there are
    // hundreds of full-pool steps to measure.
    while (frames < RUN_BUDGET) {
      const frame = session.render.getFrame();
      if (!frame.running) break;
      if (frame.offers !== null) {
        session.upgrades.choose(frame.offers[0]);
        continue;
      }

      const started = performance.now();
      session.frame(FRAME_MS);
      const cost = performance.now() - started;

      meanStepMs += (cost - meanStepMs) / (frames + 1);
      if (cost > worstStepMs) worstStepMs = cost;
      frames += 1;

      fingerprint.add(frame.score);
      fingerprint.add(world.counts().enemies);
    }

    assert.ok(world.counts().enemies <= ENEMY_CAP, 'the pool never exceeds its cap');
    assert.ok(frames >= 60, `measured ${frames} frames of a full pool`);

    assert.ok(
      meanStepMs <= MEAN_STEP_BUDGET_MS,
      `mean step ${meanStepMs.toFixed(3)} ms exceeds ${MEAN_STEP_BUDGET_MS} ms`,
    );
    assert.ok(
      worstStepMs <= WORST_STEP_BUDGET_MS,
      `worst step ${worstStepMs.toFixed(3)} ms exceeds ${WORST_STEP_BUDGET_MS} ms`,
    );
  });

  test('a fought run stays inside the same budget', () => {
    // Bullets, level-up cards and a crowd: the other half of the frame cost.
    const round = playRound(9, { frames: FINGERPRINT_FRAMES });

    assert.ok(
      round.meanStepMs <= MEAN_STEP_BUDGET_MS,
      `mean ${round.meanStepMs.toFixed(3)} ms`,
    );
    assert.ok(
      round.worstStepMs <= WORST_STEP_BUDGET_MS,
      `worst ${round.worstStepMs.toFixed(3)} ms`,
    );
  });
});

