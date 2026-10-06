import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GameWorld } from '../src/core/GameWorld.ts';
import { RandomAdapter } from '../src/adapters/random/RandomAdapter.ts';
import { ENEMY_CAP, PLAYER_RADIUS } from '../src/core/config.ts';
import type {
  LevelUpEvent,
  RunEndedEvent,
  UpgradeId,
  WorldEventsPort,
  WorldFrame,
} from '../src/core/types.ts';
import { IDLE } from './support/survivor.ts';

const STEP = 1 / 30;
/** Tall enough that the whole pool has walked in before the frames run out. */
const FRAME_BUDGET = 30 * 30;
/**
 * How deep the survivor may be stood in, in world units: about three screen
 * pixels, which is where an interpenetrating sprite stops being readable.
 */
const TOLERANCE = 1;
/** Within this of touching, a pair counts as shoulder to shoulder. */
const CONTACT_GAP = 1;
/** Enough touching pairs for the crowd to be a real crowd, not a queue. */
const CONTACTS_MIN = 30;
/** Within this of the survivor, a zombie counts as part of the pile. */
const PACK_RADIUS = 150;
/** Enough of the pool has to end up packed for the overlaps to mean anything. */
const PACKED_MIN = 40;

const VIEW = { w: 700, h: 1400 };

/** The world talks to this; a test only reads the frame. */
class Recorder implements WorldEventsPort {
  readonly ends: RunEndedEvent[] = [];
  readonly levelUps: LevelUpEvent[] = [];
  choices: UpgradeId[] = [];

  onRunEnded(event: RunEndedEvent): void { this.ends.push(event); }
  onLevelUp(event: LevelUpEvent): void { this.levelUps.push(event); }
  onEnemyKilled(): void { /* the test's business */ }
  onPlayerHit(): void { /* the test's business */ }
  onBulletFired(): void { /* the test's business */ }
  onBulletPickedUp(): void { /* the test's business */ }
  onExplosion(): void { /* the test's business */ }
  onUpgradeChosen(event: { id: UpgradeId }): void { this.choices.push(event.id); }
}

interface Depth {
  /** Deepest zombie-in-zombie overlap, and where the pair stood. */
  readonly pair: number;
  readonly where: number;
  /** Deepest zombie-in-survivor overlap. */
  readonly player: number;
  /** Pairs standing close enough to be shouldering each other, `<= 1` apart. */
  readonly contacts: number;
}

/** Deepest body overlap in one frame: positive means two circles share space. */
const overlap = (frame: WorldFrame): Depth => {
  const px = frame.player.x;
  const py = frame.player.y;
  const enemies = frame.enemies;

  let pair = 0;
  let where = 0;
  let player = 0;
  let contacts = 0;
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    const away = Math.hypot(a.x - px, a.y - py) - (a.radius + PLAYER_RADIUS);
    if (-away > player) player = -away;

    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      // Squared first: a field this size is mostly bodies that are nowhere
      // near each other, and only the close ones are worth a square root.
      const reach = a.radius + b.radius;
      const within = reach + CONTACT_GAP;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > within * within) continue;

      const gap = Math.sqrt(dSq) - reach;
      if (gap <= CONTACT_GAP) contacts += 1;
      if (-gap > pair) {
        pair = -gap;
        where = Math.hypot((a.x + b.x) / 2 - px, (a.y + b.y) / 2 - py);
      }
    }
  }
  return { pair, where, player, contacts };
};

interface Pile {
  /** Steps actually simulated before the round ended. */
  readonly steps: number;
  /** Deepest zombie-in-zombie overlap ever rendered. */
  readonly pair: number;
  /** Deepest zombie-in-survivor overlap ever rendered. */
  readonly player: number;
  /** Most zombies that ever stood within `PACK_RADIUS` of the survivor. */
  readonly packed: number;
  /** Closest a zombie edge ever came to the survivor: <= 0 is contact. */
  readonly nearest: number;
  /** Round time of the deepest overlap, and how far out it happened. */
  readonly when: number;
  readonly where: number;
  /** Steps whose deepest overlap stayed under 1, and over 3 units. */
  readonly calm: number;
  readonly deep: number;
  /** Most zombies alive at any one step of the run. */
  readonly alive: number;
  /** Most pairs that ever stood shoulder to shoulder at one step. */
  readonly contacts: number;
}

/**
 * Rings a full pool of shamblers around a survivor who never moves, then lets
 * the whole horde walk in. Everything that matters happens in the last few
 * seconds of that walk: 120 bodies all homing onto one point have to end up
 * as a crowd standing *around* the survivor, not as one sprite standing
 * inside another.
 */
const pileUp = (): Pile => {
  const world = new GameWorld(new RandomAdapter(11), new Recorder());
  world.setViewSize(VIEW.w, VIEW.h);
  world.step(STEP, IDLE); // wave 1 exists now, so the ring knows where to stand
  world.seedRing(ENEMY_CAP - world.counts().enemies);

  let steps = 0;
  let pair = 0;
  let player = 0;
  let packed = 0;
  let nearest = Infinity;
  let when = 0;
  let where = 0;
  let calm = 0;
  let deep = 0;
  let alive = 0;
  let contacts = 0;

  for (; steps < FRAME_BUDGET; steps++) {
    const frame = world.getFrame();
    if (!frame.running) break;
    if (frame.offers !== null) {
      world.choose(frame.offers[0]);
      continue;
    }

    world.step(STEP, IDLE);

    const after = world.getFrame();
    const depth = overlap(after);
    if (depth.pair > pair) {
      pair = depth.pair;
      when = after.time;
      where = depth.where;
    }
    if (depth.player > player) player = depth.player;
    if (depth.contacts > contacts) contacts = depth.contacts;
    if (depth.pair <= 1) calm += 1;
    if (depth.pair > 3) deep += 1;

    let inRange = 0;
    for (const enemy of after.enemies) {
      const ex = enemy.x - after.player.x;
      const ey = enemy.y - after.player.y;
      const gap = Math.sqrt(ex * ex + ey * ey) - (enemy.radius + PLAYER_RADIUS);
      if (gap < nearest) nearest = gap;
      if (gap <= PACK_RADIUS) inRange += 1;
    }
    if (inRange > packed) packed = inRange;
    if (after.enemies.length > alive) alive = after.enemies.length;
  }

  return { steps, pair, player, packed, nearest, when, where, calm, deep, alive, contacts };
};

/** Everything one pile-up run observed, so a failure reports the whole run. */
const report = (pile: Pile): string =>
  `steps=${pile.steps} alive=${pile.alive} packed=${pile.packed} contacts=${pile.contacts} ` +
  `nearest=${pile.nearest.toFixed(2)} pair=${pile.pair.toFixed(2)} at t=${pile.when.toFixed(1)} ` +
  `r=${pile.where.toFixed(0)} player=${pile.player.toFixed(2)} calm=${pile.calm} deep=${pile.deep}`;

/**
 * The walk, run once for the whole file: it is a fixed seed over a fixed
 * script, so both tests read the same run rather than paying for it twice -
 * and the suite stays light enough that it does not steal time from the
 * step-budget test that runs beside it.
 */
let piled: Pile | null = null;
const pile = (): Pile => (piled ??= pileUp());

describe('horde collision', () => {
  test('a packed pool never puts two zombies in the same place', () => {
    const run = pile();

    assert.ok(run.steps >= 60, `simulated ${run.steps} steps before the round ended`);
    assert.ok(
      run.packed >= PACKED_MIN,
      `only ${run.packed} of ${ENEMY_CAP} zombies ever stood within ${PACK_RADIUS} of the survivor`,
    );
    assert.ok(
      run.contacts >= CONTACTS_MIN,
      `the pile only ever had ${run.contacts} pairs shoulder to shoulder - ${report(run)}`,
    );
    assert.ok(run.nearest <= 1, `the horde stopped ${run.nearest.toFixed(1)} units short`);

    assert.ok(
      run.pair <= TOLERANCE,
      `two zombies overlapped by ${run.pair.toFixed(2)} units (budget ${TOLERANCE}) - ${report(run)}`,
    );
  });

  test('the pile arrives around the survivor instead of standing in them', () => {
    const run = pile();

    assert.ok(
      run.packed >= PACKED_MIN && run.contacts >= CONTACTS_MIN,
      `the pile was never a crowd: ${run.packed} close, ${run.contacts} touching - ${report(run)}`,
    );
    assert.ok(run.nearest <= 1, `the horde stopped ${run.nearest.toFixed(1)} units short`);
    assert.ok(
      run.player <= TOLERANCE,
      `a zombie stood ${run.player.toFixed(2)} units inside the survivor (budget ${TOLERANCE}) - ${report(run)}`,
    );
  });
});
