import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GameWorld } from '../src/core/GameWorld.ts';
import { WaveDirector, planWave, type SpawnEntry } from '../src/core/WaveDirector.ts';
import { RandomAdapter } from '../src/adapters/random/RandomAdapter.ts';
import {
  availableUpgrades,
  bulletDamageFor,
  bulletRangeFor,
  chamberFor,
  crawlSpeedFor,
  dreadPaceFor,
  explosiveRadiusFor,
  fireRangeFor,
  homingTurnFor,
  initialUpgrades,
  invulnWindowFor,
  moveSpeedFor,
  pickupRadiusFor,
  rarityPool,
  scoreFor,
  shockwavePushFor,
  shotDelayFor,
  sweepRadiusFor,
  thornsDamageFor,
  upgradeDef,
  UPGRADES,
  variantChanceFor,
  waveSizeFor,
  waveSpeedMultiplier,
  xpNeededForLevel,
  type UpgradeState,
} from '../src/core/rules.ts';
import {
  BREATHER_MAX,
  BREATHER_MIN,
  BULLET_CAP,
  BULLET_RADIUS,
  BULLET_RANGE,
  BULLET_SPEED,
  CRAWL_SPEED,
  CRAWL_SPEED_STEP,
  DREAD_FLOOR,
  DREAD_STEP,
  ENEMY_CAP,
  ENEMY_STATS,
  EXPLOSIVE_RADIUS,
  EXPLOSIVE_RADIUS_STEP,
  FIRE_RANGE,
  GRIT_STEP,
  HEAVY_ROUND_SLOWDOWN,
  HOMING_STEP,
  INVULNERABLE_SECONDS,
  LONG_BARREL_STEP,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SECOND_WIND_HEARTS,
  SECOND_WIND_PUSH,
  SHOCKWAVE_STEP,
  SHOT_DELAY,
  SPAWN_LAG,
  SPAWN_RING_MARGIN,
  SUPER_RARE_FROM_WAVE,
  SWEEP_RADIUS,
  THORNS_STEP,
  WAVE_CAP,
} from '../src/core/config.ts';
import type {
  EnemyKind,
  LevelUpEvent,
  RunEndedEvent,
  UpgradeId,
  Vec2,
  WorldEventsPort,
  WorldFrame,
} from '../src/core/types.ts';
import { IDLE, engage, unit } from './support/survivor.ts';

const STEP = 1 / 30;

/** A roomy arena for the scripted survivor: the spawn ring sits at ~852. */
const ARENA = { w: 700, h: 1400 };
/** Ring radius the world derives from a view size. */
const ringFor = (view: { w: number; h: number }): number =>
  Math.hypot(view.w / 2, view.h / 2) + SPAWN_RING_MARGIN;

/** Records everything the world reports; the renderer's stand-in. */
class Recorder implements WorldEventsPort {
  readonly ends: RunEndedEvent[] = [];
  readonly levelUps: LevelUpEvent[] = [];
  /** Heart counts in the order the world reported them. */
  readonly hpHistory: number[] = [];
  readonly explosions: { x: number; y: number; radius: number }[] = [];
  kills = 0;
  hits = 0;
  shots = 0;
  pickups = 0;
  choices: UpgradeId[] = [];

  onRunEnded(event: RunEndedEvent): void { this.ends.push(event); }
  onLevelUp(event: LevelUpEvent): void { this.levelUps.push(event); }
  onEnemyKilled(): void { this.kills += 1; }
  onPlayerHit(event: { hp: number }): void { this.hits += 1; this.hpHistory.push(event.hp); }
  onBulletFired(): void { this.shots += 1; }
  onBulletPickedUp(): void { this.pickups += 1; }
  onExplosion(event: { x: number; y: number; radius: number }): void {
    this.explosions.push(event);
  }
  onUpgradeChosen(event: { id: UpgradeId }): void { this.choices.push(event.id); }
}

interface Harness {
  readonly world: GameWorld;
  readonly events: Recorder;
}

const harness = (seed = 7, view: { w: number; h: number } = { w: 400, h: 800 }): Harness => {
  const events = new Recorder();
  const world = new GameWorld(new RandomAdapter(seed), events);
  world.setViewSize(view.w, view.h);
  return { world, events };
};

/** Nearest live enemy, measured off the frame exactly as the world measures it. */
const nearestEnemyDistance = (frame: WorldFrame): number => {
  let best = Infinity;
  for (const enemy of frame.enemies) {
    const d = Math.hypot(enemy.x - frame.player.x, enemy.y - frame.player.y);
    if (d < best) best = d;
  }
  return best;
};

const nearestEnemy = (frame: WorldFrame) => {
  let best = null as null | { x: number; y: number };
  let bestSq = Infinity;
  for (const enemy of frame.enemies) {
    const dx = enemy.x - frame.player.x;
    const dy = enemy.y - frame.player.y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestSq) {
      bestSq = dSq;
      best = enemy;
    }
  }
  return best;
};

/**
 * Steps until `done`, auto-accepting level-up cards so an unrelated assertion
 * is never stuck behind an unanswered offer. `pick` chooses which card - a
 * test that is measuring bullets, for instance, must not be handed a second
 * chamber by accident.
 */
const runUntil = (
  world: GameWorld,
  done: (step: number) => boolean,
  maxSteps: number,
  move: (frame: WorldFrame) => Vec2 = () => IDLE,
  pick: (offers: readonly UpgradeId[]) => UpgradeId = (offers) => offers[0],
): number => {
  for (let i = 0; i < maxSteps; i++) {
    const frame = world.getFrame();
    if (done(i)) return i;

    if (frame.offers && frame.offers.length > 0) world.choose(pick(frame.offers));
    world.step(STEP, move(frame));
  }
  return -1;
};

/** Plans for `wave`, as the director would build them. */
const planFor = (wave: number, seed = 11): SpawnEntry[] =>
  planWave(wave, new RandomAdapter(seed), []);

const kindsIn = (entries: readonly SpawnEntry[]): Map<EnemyKind, number> => {
  const counts = new Map<EnemyKind, number>();
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  return counts;
};

// ---------------------------------------------------------------------------

describe('progression rules', () => {
  test('XP needed is 3 + level x 3', () => {
    assert.equal(xpNeededForLevel(1), 6);
    assert.equal(xpNeededForLevel(2), 9);
    assert.equal(xpNeededForLevel(5), 18);

    for (let level = 1; level < 40; level++) {
      assert.equal(xpNeededForLevel(level), 3 + level * 3);
    }
  });

  test('score is kill points + 100 per wave cleared + 50 per level gained', () => {
    assert.equal(
      scoreFor({ points: 130, wavesCleared: 2, levelsGained: 3 }),
      130 + 200 + 150,
    );
    assert.equal(scoreFor({ points: 0, wavesCleared: 0, levelsGained: 0 }), 0);
  });

  test('kill points are 10, 20 and 30 by zombie type', () => {
    assert.equal(ENEMY_STATS.zombie.points, 10);
    assert.equal(ENEMY_STATS.fast.points, 20);
    assert.equal(ENEMY_STATS.tank.points, 30);
    // XP feeds the level curve, and it is the same order of magnitude.
    assert.equal(ENEMY_STATS.zombie.xp, 1);
    assert.equal(ENEMY_STATS.fast.xp, 2);
    assert.equal(ENEMY_STATS.tank.xp, 5);
  });
});

describe('wave rules', () => {
  test('a wave is 4 x wave - 1 zombies, capped at the 120 pool', () => {
    assert.equal(waveSizeFor(1), 3);
    assert.equal(waveSizeFor(2), 7);
    assert.equal(waveSizeFor(3), 11);
    assert.equal(waveSizeFor(5), 19);
    assert.equal(waveSizeFor(8), 31);
    assert.equal(waveSizeFor(10), 39);
    assert.equal(waveSizeFor(20), 79);
    assert.equal(waveSizeFor(31), 120, 'wave 31 is the first one that hits the cap');
    assert.equal(waveSizeFor(40), 120);
    assert.equal(waveSizeFor(1000), 120, 'the cap holds for the whole endless run');

    assert.equal(WAVE_CAP, ENEMY_CAP, 'one wave must always fit in the pool');
    for (let wave = 1; wave <= 30; wave++) {
      assert.equal(waveSizeFor(wave), 4 * wave - 1);
      assert.ok(waveSizeFor(wave) <= ENEMY_CAP);
    }
  });

  test('variants are impossible before wave 8, then rare and capped at 20 %', () => {
    for (let wave = 1; wave < 8; wave++) {
      assert.equal(variantChanceFor(wave), 0, `wave ${wave} must be all shamblers`);
    }

    assert.ok(Math.abs(variantChanceFor(8) - 0.04) < 1e-9, '4 % at wave 8');
    assert.ok(Math.abs(variantChanceFor(9) - 0.055) < 1e-9, 'then +1.5 % per wave');
    assert.ok(Math.abs(variantChanceFor(18) - 0.19) < 1e-9);
    assert.equal(variantChanceFor(19), 0.2, 'capped at 20 %');
    assert.equal(variantChanceFor(60), 0.2, 'and it stays there');
  });

  test('speed only ramps after wave 31, and never past +30 %', () => {
    for (let wave = 1; wave <= 31; wave++) {
      assert.equal(waveSpeedMultiplier(wave), 1, `wave ${wave} must not be sped up yet`);
    }

    assert.ok(Math.abs(waveSpeedMultiplier(32) - 1.02) < 1e-9, '+2 % per wave from 32');
    assert.ok(Math.abs(waveSpeedMultiplier(46) - 1.3) < 1e-9, '+30 % at wave 46');
    assert.equal(waveSpeedMultiplier(900), 1.3, 'and there it stops');
  });

  test('the breather the director rolls is always 3 to 5 seconds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const director = new WaveDirector(new RandomAdapter(seed));
      director.begin();
      director.tick(STEP, 0); // nothing alive: the wave is cleared at once

      assert.equal(director.phase, 'breather');
      assert.ok(director.breatherDuration >= BREATHER_MIN, 'never under three seconds');
      assert.ok(director.breatherDuration <= BREATHER_MAX, 'never over five');
      assert.equal(director.breatherRemaining, director.breatherDuration);
    }
  });
});

describe('wave plans', () => {
  test('a plan covers the whole wave, spread around the ring', () => {
    const plan = planFor(3);
    assert.equal(plan.length, 11, 'wave 3 is eleven zombies');

    const seen = new Set<number>();
    for (const entry of plan) {
      assert.ok(entry.angle >= -Math.PI && entry.angle <= Math.PI * 2);
      assert.ok(entry.lag >= 0 && entry.lag <= SPAWN_LAG, 'arrival stagger stays on the ring');
      seen.add(Math.round(entry.angle * 100));
    }
    assert.equal(seen.size, plan.length, 'no two zombies stand on the same spot');
  });

  test('waves 1 to 7 are all shamblers', () => {
    for (let wave = 1; wave <= 7; wave++) {
      const counts = kindsIn(planFor(wave));
      assert.equal(counts.get('zombie'), waveSizeFor(wave), `wave ${wave} is homogeneous`);
      assert.equal(counts.get('fast'), undefined);
      assert.equal(counts.get('tank'), undefined);
    }
  });

  test('from wave 8 variants show up, but stay a minority', () => {
    let zombies = 0;
    let variants = 0;

    for (let wave = 8; wave <= 16; wave++) {
      const counts = kindsIn(planFor(wave, 5));
      const waveZombies = counts.get('zombie') ?? 0;
      const waveVariants = (counts.get('fast') ?? 0) + (counts.get('tank') ?? 0);

      assert.equal(waveZombies + waveVariants, waveSizeFor(wave));
      assert.ok(waveZombies > 0, 'the horde is still mostly shamblers');

      zombies += waveZombies;
      variants += waveVariants;
    }

    assert.ok(variants > 0, 'the seeded rolls do produce a variant');
    assert.ok(
      variants / (zombies + variants) < 0.25,
      `variants must stay rare, saw ${(variants / (zombies + variants)).toFixed(3)}`,
    );
  });
});

describe('wave director', () => {
  test('it hands out the whole first wave in one go', () => {
    const director = new WaveDirector(new RandomAdapter(5));
    const plan = director.begin();

    assert.equal(plan.length, 3);
    assert.equal(director.wave, 1);
    assert.equal(director.phase, 'fight');
    assert.equal(director.wavesCleared, 0);
    assert.equal(director.speedMultiplier, 1);
  });

  test('nothing happens while zombies are alive', () => {
    const director = new WaveDirector(new RandomAdapter(5));
    director.begin();

    for (let step = 0; step < 300; step++) {
      const tick = director.tick(STEP, 4);
      assert.equal(tick.cleared, false, 'a wave clears only when the last zombie falls');
      assert.equal(tick.spawn, null, 'and the next one never starts early');
    }
    assert.equal(director.wave, 1);
    assert.equal(director.phase, 'fight');
  });

  test('a clear starts the breather, and the next wave follows it', () => {
    const director = new WaveDirector(new RandomAdapter(5));
    director.begin();

    const cleared = director.tick(STEP, 0);
    assert.equal(cleared.cleared, true, 'the clear is reported exactly once');
    assert.equal(director.wavesCleared, 1);
    assert.equal(director.phase, 'breather');

    const again = director.tick(STEP, 0);
    assert.equal(again.cleared, false, 'the same wave cannot clear twice');

    // The breather runs down only through ticks - which is what lets a level-up
    // overlay hold it in place without the director knowing overlays exist.
    let steps = 1;
    let last = director.breatherRemaining;
    let nextWave: readonly SpawnEntry[] | null = null;

    while (nextWave === null && steps < 30 * 8) {
      const tick = director.tick(STEP, 0);
      steps += 1;
      if (tick.spawn) {
        nextWave = tick.spawn;
        break;
      }
      const now = director.breatherRemaining;
      assert.ok(now < last, 'a tick always moves the breather forward');
      last = now;
    }

    assert.ok(nextWave, 'the breather eventually hands out the next wave');
    assert.ok(steps >= 30 * BREATHER_MIN, 'never shorter than three seconds');
    assert.ok(steps <= 30 * BREATHER_MAX + 1, 'never longer than five');
    assert.equal(director.wave, 2, 'and the breather is what advances the wave');
    assert.equal(director.phase, 'fight');
    assert.equal(nextWave.length, 7, 'wave 2 is seven zombies');
    assert.equal(director.wavesCleared, 1, 'clearing a wave is counted once');
  });

  test('the same seed always plans the same wave', () => {
    const first = planFor(9, 21);
    const second = planFor(9, 21);
    const other = planFor(9, 22);

    assert.deepEqual(first, second, 'a seeded plan is reproducible');
    assert.notDeepEqual(first, other, 'a different seed is not');
  });
});

describe('wave spawning in the world', () => {
  test('wave 1 is three zombies, placed together on the very first step', () => {
    const view = { w: 400, h: 800 };
    const { world } = harness(4, view);
    assert.equal(world.counts().enemies, 0, 'nothing exists before the first step');

    world.step(STEP, IDLE);

    const frame = world.getFrame();
    assert.equal(world.counts().enemies, 3, 'the whole wave arrives in one tick');
    assert.equal(frame.wave, 1);
    assert.equal(frame.phase, 'fight');

    const ring = ringFor(view);
    for (const enemy of frame.enemies) {
      assert.equal(enemy.kind, 'zombie');
      const distance = Math.hypot(enemy.x - frame.player.x, enemy.y - frame.player.y);
      assert.ok(
        Math.abs(distance - ring) <= SPAWN_LAG,
        `spawned just outside the screen, was ${distance.toFixed(1)} from a ring of ${ring}`,
      );
    }
    assert.equal(frame.enemies[0].radius, ENEMY_STATS.zombie.radius);
  });

  test('clearing wave 1 banks +100 and opens a breather with no zombies in it', () => {
    const { world, events } = harness(6, ARENA);

    const cleared = runUntil(world, () => world.getFrame().phase === 'breather', 30 * 60, engage);
    assert.ok(cleared >= 0, 'three shamblers are no match for a competent survivor');
    assert.equal(events.kills, 3);

    const frame = world.getFrame();
    assert.equal(frame.wave, 1, 'the wave only advances after the breather');
    assert.equal(world.counts().enemies, 0, 'a breather is empty by definition');
    assert.ok(frame.breatherTotal >= BREATHER_MIN && frame.breatherTotal <= BREATHER_MAX);
    assert.ok(frame.breatherLeft > 0 && frame.breatherLeft <= frame.breatherTotal);

    // 3 kills x 10 points, one wave cleared x 100, no level yet: 3 XP of the 6
    // needed for level 2. Every part of the score formula is visible at once.
    assert.equal(frame.level, 1);
    assert.equal(frame.score, 130);
  });

  test('the next wave arrives as one group, seven zombies wide', () => {
    const { world } = harness(6, ARENA);
    runUntil(world, () => world.getFrame().phase === 'breather', 30 * 60, engage);
    assert.equal(world.counts().enemies, 0);

    let aliveBefore = 0;
    let jump = 0;
    for (let step = 0; step < 30 * 30 && jump === 0; step++) {
      const frame = world.getFrame();
      if (frame.offers && frame.offers.length > 0) world.choose(frame.offers[0]);
      world.step(STEP, engage(frame));

      const alive = world.counts().enemies;
      if (alive > aliveBefore) jump = alive;
      aliveBefore = alive;
    }

    assert.equal(jump, 7, 'wave 2 lands all at once, not one zombie at a time');
    assert.equal(world.getFrame().wave, 2);
  });

  test('the pool never grows past the 120 cap', () => {
    const { world } = harness(13, ARENA);

    runUntil(world, (step) => step >= 30 * 45, 30 * 45, engage);
    const counts = world.counts();
    assert.ok(counts.enemies <= ENEMY_CAP, `enemies peaked at ${counts.enemies}`);
    assert.ok(counts.bullets <= BULLET_CAP, 'the bullet pool stays bounded');
  });
});

/** A wave at which every card in the deck has already unlocked. */
const OPEN_WAVE = 20;

describe('upgrade stacking and caps', () => {
  const stacks = (over: Partial<UpgradeState>): UpgradeState => ({
    ...initialUpgrades(),
    ...over,
  });
  /** Which cards the gate would hand to a level-up right now. */
  const cards = (state: UpgradeState, hp = PLAYER_MAX_HP, wave = OPEN_WAVE): UpgradeId[] =>
    availableUpgrades(state, hp, PLAYER_MAX_HP, wave).map((def) => def.id);

  test('the chamber starts at one and stops at six', () => {
    assert.equal(chamberFor(initialUpgrades()), 1);
    assert.equal(chamberFor(stacks({ extraChamber: 5 })), 6);

    assert.ok(!cards(stacks({ extraChamber: 5 })).includes('extraChamber'), 'caps out at 6');
    assert.ok(cards(stacks({ extraChamber: 4 })).includes('extraChamber'));
  });

  test('Quick Hands, Long Barrel and Sprint stop at 4, Boomerang and Shockwave at 3', () => {
    for (const [id, max] of [
      ['quickHands', 4],
      ['longBarrel', 4],
      ['sprint', 4],
      ['boomerang', 3],
      ['shockwave', 3],
      ['grit', 3],
      ['homing', 3],
      ['thorns', 3],
      ['dread', 5],
    ] as const) {
      assert.ok(!cards(stacks({ [id]: max })).includes(id), `${id} must be gone at ${max} stacks`);
      assert.ok(
        cards(stacks({ [id]: max - 1 })).includes(id),
        `${id} is still offered one short of its cap`,
      );
    }
  });

  test('three cards never stop, and the rest are all sealed at a number', () => {
    const openEnded = UPGRADES.filter((def) => def.max === Infinity)
      .map((def) => def.id)
      .sort();
    assert.deepEqual(
      openEnded,
      ['explosive', 'magnet', 'mend'],
      'the stack sinks a long run keeps paying into',
    );

    // Every other card is finite, so the deck splits into the three cards you
    // never finish and the thirteen you always can.
    assert.equal(openEnded.length + UPGRADES.filter((def) => def.max < Infinity).length, UPGRADES.length);
    for (const def of UPGRADES) {
      if (def.max === Infinity) continue;
      assert.ok(
        !cards(stacks({ [def.id]: def.max })).includes(def.id),
        `${def.id} is sealed at ${def.max}`,
      );
      assert.ok(
        cards(stacks({ [def.id]: def.max - 1 })).includes(def.id),
        `${def.id} is still offered one short of its cap`,
      );
    }
  });

  test('Magnet is the stacker that never stops', () => {
    assert.equal(upgradeDef('magnet').max, Infinity, 'the pull has no ceiling');

    // Well past where every other stacker would have been sealed.
    assert.ok(cards(stacks({ magnet: 4 })).includes('magnet'), 'still offered at the old cap of 4');
    assert.ok(cards(stacks({ magnet: 99 })).includes('magnet'), 'and at ninety-nine');
    assert.ok(
      pickupRadiusFor(stacks({ magnet: 99 })) > pickupRadiusFor(stacks({ magnet: 4 })),
      'and the reach keeps growing with it',
    );
  });

  test('Heavy Round, Second Wind and Blood Frenzy are taken once', () => {
    const taken = [
      ['heavyRound', { ...initialUpgrades(), heavyRound: 1 }],
      ['secondWind', { ...initialUpgrades(), secondWind: 1 }],
      ['bloodFrenzy', { ...initialUpgrades(), bloodFrenzy: 1 }],
    ] as const;

    for (const [id, state] of taken) {
      assert.equal(state[id], 1, `${id} is a one-take card`);
      assert.ok(!cards(state).includes(id), `${id} must never be offered twice`);
    }
  });

  test('Explosive Round is the Legendary that never stops: the blast widens', () => {
    const one = stacks({ explosive: 1 });

    assert.equal(explosiveRadiusFor(one), EXPLOSIVE_RADIUS, 'the first stack is the base blast');

    const wide = stacks({ explosive: 4 });
    assert.equal(
      explosiveRadiusFor(wide),
      EXPLOSIVE_RADIUS + 3 * EXPLOSIVE_RADIUS_STEP,
      'every stack past the first widens it by the documented step',
    );
    assert.ok(explosiveRadiusFor(wide) > explosiveRadiusFor(one), 'and it keeps growing');
    assert.ok(
      cards(wide).includes('explosive'),
      'so it is still on offer long after every finite card is sealed',
    );
  });

  test('Mend only shows up while a heart can be restored', () => {
    const fresh = initialUpgrades();

    assert.equal(bulletDamageFor(fresh), 1);
    assert.equal(bulletDamageFor(stacks({ heavyRound: 1 })), 2);

    assert.ok(cards(fresh).includes('heavyRound'), 'and Heavy Round is a plain Common');
    assert.ok(cards(fresh, 3).includes('mend'), 'Mend shows while a heart can be restored');
    assert.ok(!cards(fresh, PLAYER_MAX_HP).includes('mend'), 'but never at full health');
    // Repeatable: it comes back every time the player is still hurt.
    assert.ok(cards(stacks({ mend: 6 }), 1).includes('mend'));
  });

  test('derived stats move the way the cards promise', () => {
    const fresh = initialUpgrades();

    assert.equal(shotDelayFor(fresh), shotDelayFor(stacks({ quickHands: 0 })));
    assert.ok(shotDelayFor(stacks({ quickHands: 4 })) < shotDelayFor(fresh));

    const sprinted = moveSpeedFor(stacks({ sprint: 4 }));
    assert.ok(Math.abs(sprinted - PLAYER_SPEED * 1.32) < 1e-9);

    assert.ok(pickupRadiusFor(stacks({ magnet: 4 })) > pickupRadiusFor(fresh));

    // The blast belongs to Explosive Round alone.
    assert.equal(explosiveRadiusFor(fresh), 0);
    assert.equal(explosiveRadiusFor(stacks({ explosive: 1 })), EXPLOSIVE_RADIUS);
  });

  test('the newer cards promise numbers that move with their stacks', () => {
    const fresh = initialUpgrades();

    // Grit: the same window, held open longer.
    assert.equal(invulnWindowFor(fresh), INVULNERABLE_SECONDS);
    assert.equal(
      invulnWindowFor(stacks({ grit: 3 })),
      INVULNERABLE_SECONDS + 3 * GRIT_STEP,
    );

    // Thorns and Shockwave: nothing at zero stacks, the documented step each.
    assert.equal(thornsDamageFor(fresh), 0);
    assert.equal(thornsDamageFor(stacks({ thorns: 2 })), 2 * THORNS_STEP);
    assert.equal(shockwavePushFor(fresh), 0);
    assert.equal(shockwavePushFor(stacks({ shockwave: 3 })), 3 * SHOCKWAVE_STEP);

    // Dread: slower, never stopped - a crowd that cannot reach you is one
    // you cannot shoot, so the pace has a floor.
    assert.equal(dreadPaceFor(fresh), 1);
    assert.equal(dreadPaceFor(stacks({ dread: 1 })), 1 - DREAD_STEP);
    assert.equal(dreadPaceFor(stacks({ dread: 5 })), 1 - 5 * DREAD_STEP);
    assert.equal(dreadPaceFor(stacks({ dread: 999 })), DREAD_FLOOR, 'the floor holds');

    // Homing: no bend at all until the card is taken.
    assert.equal(homingTurnFor(fresh), 0);
    assert.equal(homingTurnFor(stacks({ homing: 2 })), 2 * HOMING_STEP);
  });

  test('Boomerang and Magnet only sweep together - the pair neither has alone', () => {
    const fresh = initialUpgrades();

    assert.equal(sweepRadiusFor(fresh), 0, 'with neither card there is no sweep');
    assert.equal(
      sweepRadiusFor(stacks({ boomerang: 3 })),
      0,
      'Boomerang alone only brings its own round home',
    );
    assert.equal(
      sweepRadiusFor(stacks({ magnet: 9 })),
      0,
      'Magnet alone only reaches what is already inside the pickup radius',
    );
    assert.equal(
      sweepRadiusFor(stacks({ boomerang: 1, magnet: 1 })),
      SWEEP_RADIUS,
      'together they sweep the rounds lying out in the horde',
    );
    assert.equal(
      sweepRadiusFor(stacks({ boomerang: 3, magnet: 9 })),
      SWEEP_RADIUS,
      'and it is a reach, not a stat: the stacks only make the trip faster',
    );
  });

  test('the shot starts short, and only Long Barrel reaches further', () => {
    const fresh = initialUpgrades();
    const far = stacks({ longBarrel: 4 });

    assert.equal(bulletRangeFor(fresh), BULLET_RANGE);
    assert.equal(fireRangeFor(fresh), FIRE_RANGE);
    assert.ok(BULLET_RANGE < 300, 'the revolver does not fire across the screen to begin with');

    // Both the flight and the auto-fire gate move together, so the shot the
    // world is willing to take is always one the bullet can actually reach.
    for (const state of [fresh, stacks({ longBarrel: 1 }), stacks({ longBarrel: 4 })]) {
      assert.ok(fireRangeFor(state) < bulletRangeFor(state), 'the bullet out-reaches the gate');
    }
    assert.equal(
      bulletRangeFor(far) - bulletRangeFor(fresh),
      4 * LONG_BARREL_STEP,
      'four stacks add up to the documented step',
    );
    assert.ok(bulletRangeFor(far) > BULLET_RANGE, 'and a fully stacked barrel shoots further');
  });

  test('Magnet pulls a grounded bullet in, which is taken only on touch', () => {
    const fresh = initialUpgrades();

    // Nothing crawls before the card exists: base pickup stays a walk-over.
    assert.equal(crawlSpeedFor(fresh), 0);
    assert.equal(crawlSpeedFor(stacks({ magnet: 1 })), CRAWL_SPEED + CRAWL_SPEED_STEP);
    assert.ok(
      crawlSpeedFor(stacks({ magnet: 4 })) > crawlSpeedFor(stacks({ magnet: 1 })),
      'and more stacks drag it home faster',
    );
    assert.ok(
      crawlSpeedFor(stacks({ magnet: 1 })) > PLAYER_SPEED,
      'a pulled bullet always beats walking over to it - that is the card',
    );
  });

  test('Heavy Round buys its damage back with a slower chambering', () => {
    const fresh = initialUpgrades();
    const heavy = stacks({ heavyRound: 1 });

    assert.equal(bulletDamageFor(heavy), 2, 'still the double-damage slug');
    assert.equal(shotDelayFor(fresh), SHOT_DELAY, 'and the plain round is untouched');
    assert.ok(shotDelayFor(heavy) > shotDelayFor(fresh), 'but the heavy one chambers slower');
    assert.ok(
      Math.abs(shotDelayFor(heavy) - SHOT_DELAY * HEAVY_ROUND_SLOWDOWN) < 1e-9,
      'by exactly the documented factor',
    );

    // Quick Hands is the card that buys the rate back: at its cap of four
    // stacks the pair is still quicker than an unupgraded revolver.
    const hasted = stacks({ heavyRound: 1, quickHands: 4 });
    assert.ok(shotDelayFor(hasted) < shotDelayFor(heavy), 'Quick Hands claws the delay back');
    assert.ok(shotDelayFor(hasted) < shotDelayFor(fresh), 'and ends up faster than the start');
  });

  test('the deck always answers with an array, even when every card is capped', () => {
    const everything = {
      extraChamber: 5,
      quickHands: 4,
      longBarrel: 4,
      magnet: 99,
      sprint: 4,
      mend: 99,
      heavyRound: 1,
      grit: 3,
      boomerang: 3,
      shockwave: 3,
      explosive: 99,
      secondWind: 1,
      bloodFrenzy: 1,
      homing: 3,
      thorns: 3,
      dread: 5,
    } satisfies UpgradeState;

    // Every card that has a cap is taken and Mend is out at full health;
    // only the two cards that never stop are left. The gate must answer
    // with an array rather than throw, and that array holds exactly those.
    assert.deepEqual(
      availableUpgrades(everything, PLAYER_MAX_HP, PLAYER_MAX_HP, OPEN_WAVE).map(
        (def) => def.id,
      ),
      ['magnet', 'explosive'],
    );
  });
});

describe('rarity and wave gating', () => {
  /** The cards a level-up could legally show at `wave`. */
  const idsAt = (wave: number, state = initialUpgrades(), hp = PLAYER_MAX_HP): UpgradeId[] =>
    availableUpgrades(state, hp, PLAYER_MAX_HP, wave).map((def) => def.id);

  test('the deck is bucketed into eight commons, two Super Rares, six Legendaries', () => {
    const common = rarityPool(UPGRADES, 'common')
      .map((def) => def.id)
      .sort();
    assert.deepEqual(common, [
      'extraChamber',
      'grit',
      'heavyRound',
      'longBarrel',
      'magnet',
      'mend',
      'quickHands',
      'sprint',
    ]);
    assert.deepEqual(
      rarityPool(UPGRADES, 'superRare').map((def) => def.id),
      ['boomerang', 'shockwave'],
    );
    assert.deepEqual(
      rarityPool(UPGRADES, 'legendary').map((def) => def.id),
      ['explosive', 'secondWind', 'bloodFrenzy', 'homing', 'thorns', 'dread'],
    );
    assert.equal(rarityPool(UPGRADES, 'common').length, 8);
    assert.equal(rarityPool(UPGRADES, 'legendary').length, 6);
    assert.equal(
      rarityPool(UPGRADES, 'common').length +
        rarityPool(UPGRADES, 'superRare').length +
        rarityPool(UPGRADES, 'legendary').length,
      UPGRADES.length,
      'every card sits in exactly one bucket',
    );
  });

  test('nothing but commons is offered before wave 10', () => {
    for (let wave = 1; wave <= 9; wave++) {
      const ids = idsAt(wave);
      assert.ok(ids.includes('sprint'), `the commons are always there at wave ${wave}`);
      assert.ok(ids.includes('grit'), `and so are the newer ones, at wave ${wave}`);
      // Nothing rare opens before wave 10 - the two Super Rares and the four
      // Legendaries that arrive after Explosive Round are all still sealed.
      for (const id of [
        'boomerang',
        'shockwave',
        'explosive',
        'secondWind',
        'bloodFrenzy',
        'homing',
        'thorns',
        'dread',
      ] as const) {
        assert.ok(!ids.includes(id), `${id} stays sealed until its wave`);
      }
    }
  });

  test('every rarer card opens at its own wave', () => {
    assert.equal(SUPER_RARE_FROM_WAVE, 12, 'the GDD quotes wave 12 for the Super Rare');
    assert.ok(!idsAt(9).includes('explosive'));
    assert.ok(idsAt(10).includes('explosive'), 'Explosive Round from wave 10');
    assert.ok(!idsAt(11).includes('boomerang') && !idsAt(11).includes('secondWind'));
    assert.ok(idsAt(12).includes('boomerang'), 'Boomerang from wave 12');
    assert.ok(idsAt(12).includes('shockwave'), 'Shockwave from wave 12, with its bucket');
    assert.ok(idsAt(12).includes('secondWind'), 'Second Wind from wave 12');
    assert.ok(!idsAt(13).includes('bloodFrenzy'));
    assert.ok(idsAt(14).includes('bloodFrenzy'), 'Blood Frenzy from wave 14');
    assert.ok(!idsAt(15).includes('homing') && !idsAt(15).includes('thorns'));
    assert.ok(idsAt(16).includes('homing'), 'Homing Round from wave 16');
    assert.ok(idsAt(16).includes('thorns'), 'Thorns from wave 16');
    assert.ok(!idsAt(17).includes('dread'));
    assert.ok(idsAt(18).includes('dread'), 'Dread from wave 18, last card in the deck');
    assert.equal(
      idsAt(20).length,
      UPGRADES.length - 1, // Mend, at full health
      'by wave 20 the whole deck but Mend is on the table',
    );
  });

  test('a long run never offers a card its wave or its cap forbids', () => {
    const { world } = harness(9, ARENA);
    let seen = 0;

    runUntil(
      world,
      (i) => {
        const frame = world.getFrame();
        for (const id of frame.offers ?? []) {
          seen += 1;
          const def = upgradeDef(id);
          assert.ok(def.unlockWave <= frame.wave, `${id} offered at wave ${frame.wave}`);
          assert.ok(frame.stacks[id] < def.max, `${id} offered past its cap`);
          if (def.needsDamage) {
            assert.ok(frame.player.hp < frame.player.maxHp, 'Mend offered at full health');
          }
        }
        return seen >= 3 || i >= 30 * 120;
      },
      30 * 120,
      engage,
    );

    assert.ok(seen > 0, 'a level-up actually happened, so the gate was exercised');
  });
});

describe('auto-fire', () => {
  test('holds the shot until an enemy is inside the fire range, then takes the nearest', () => {
    const { world, events } = harness(3);

    const watched = runUntil(world, () => events.shots > 0, 30 * 30, (frame) => {
      // Every step before the first shot: still loaded, still nothing in range.
      assert.equal(world.getFrame().held, 1, 'a loaded round does not waste its bullet');
      const distance = nearestEnemyDistance(frame);
      assert.ok(
        distance > fireRangeFor(world.getFrame().stacks),
        `fired while the nearest enemy was ${distance.toFixed(1)} away`,
      );
      return IDLE;
    });

    assert.ok(watched >= 0, 'the first enemy must eventually come into range');
    assert.ok(
      nearestEnemyDistance(world.getFrame()) <= fireRangeFor(world.getFrame().stacks),
      'the shot goes out the moment the enemy steps inside the fire range',
    );

    const frame = world.getFrame();
    assert.equal(frame.held, 0, 'firing empties the chamber');

    const target = nearestEnemy(frame);
    assert.ok(target, 'somebody is out there');
    const wanted = Math.atan2(target.y - frame.player.y, target.x - frame.player.x);
    const delta = Math.atan2(
      Math.sin(frame.bullets[0].angle - wanted),
      Math.cos(frame.bullets[0].angle - wanted),
    );
    assert.ok(Math.abs(delta) < 1e-6, 'the bullet is aimed at the nearest enemy, not just any');
  });

  test('Long Barrel is the only thing that lets the shot go out further', () => {
    const { world, events } = harness(3);
    world.grantUpgrade('longBarrel', 4);

    const watched = runUntil(world, () => events.shots > 0, 30 * 30, () => IDLE);
    assert.ok(watched >= 0, 'a stacked barrel still finds its target');

    const distance = nearestEnemyDistance(world.getFrame());
    assert.ok(
      distance > FIRE_RANGE,
      `fired at ${distance.toFixed(1)}: past where a plain revolver would have waited`,
    );
    assert.ok(
      distance <= fireRangeFor(world.getFrame().stacks),
      'but never past the range the stacks actually bought',
    );
  });
});

describe('bullet state machine', () => {
  test('held -> flight -> ground, and walking over it re-arms you', () => {
    const { world, events } = harness(3);

    assert.equal(world.getFrame().held, 1, 'the round opens with one bullet');

    const fired = runUntil(world, () => events.shots > 0, 30 * 30);
    assert.ok(fired >= 0, 'the bullet must fire at the first enemy in range');
    assert.equal(world.getFrame().bullets.length, 1);
    assert.equal(world.getFrame().bullets[0].state, 'flight');

    // It stops either where it stopped a zombie or, if it missed, out at max
    // range - and never a step beyond it.
    const landed = runUntil(
      world,
      () => world.getFrame().bullets[0]?.state === 'ground',
      30 * 20,
    );
    assert.ok(landed >= 0, 'a bullet without Boomerang must land');

    const bulletId = world.getFrame().bullets[0].id;
    const grounded = world.getFrame().bullets[0];
    const player = world.getFrame().player;
    const distance = Math.hypot(grounded.x - player.x, grounded.y - player.y);
    assert.ok(
      distance <= bulletRangeFor(world.getFrame().stacks) + BULLET_SPEED * STEP + 1,
      `never flies past max range, was ${distance.toFixed(1)}`,
    );

    // Now walk onto it: the round must leave the world with you.
    const pickedUp = runUntil(world, () => events.pickups > 0, 30 * 60, (frame) => {
      const bullet = frame.bullets.find((b) => b.id === bulletId);
      if (!bullet) return IDLE;
      return unit(bullet.x - frame.player.x, bullet.y - frame.player.y);
    });

    assert.ok(pickedUp >= 0, 'walking over the bullet must pick it up');
    assert.equal(events.pickups, 1);
    assert.ok(
      !world.getFrame().bullets.some((b) => b.id === bulletId),
      'a collected bullet leaves the world',
    );

    // ...and a full chamber shoots again as soon as something is in range.
    const rearmed = runUntil(world, () => events.shots >= 2, 30 * 15, engage);
    assert.ok(rearmed >= 0, 'a refilled chamber must fire again');
  });

  test('the opening twenty seconds produce kills, and the player is still standing', () => {
    const { world, events } = harness(5, ARENA);

    runUntil(world, (i) => i >= 30 * 20, 30 * 20, engage);

    assert.ok(events.shots >= 1);
    assert.ok(events.kills >= 3, 'twenty seconds of competent shooting');
    assert.ok(world.getFrame().player.hp > 0, 'twenty seconds of competent footwork');
    assert.equal(world.getFrame().bullets.length, world.counts().bullets, 'frame and pool agree');
  });

  test('a bullet drops where it stopped the first zombie it touched', () => {
    const { world } = harness(7, ARENA);
    const hpById = new Map<number, number>();
    const hurt = new Map<number, number>();
    let flying: number[] = [];
    let worst = 0;

    // Zombies only ever lose hp to a bullet, so whatever vanished in a step
    // belongs to whichever bullet was out when that step ran.
    runUntil(
      world,
      (i) => {
        const frame = world.getFrame();
        const next = new Map<number, number>();
        for (const enemy of frame.enemies) next.set(enemy.id, enemy.hp);

        let lost = 0;
        for (const [id, hp] of hpById) {
          if ((next.get(id) ?? 0) < hp) lost += 1; // zombies hurt, not hp spent
        }
        for (const id of flying) {
          const total = (hurt.get(id) ?? 0) + lost;
          hurt.set(id, total);
          if (total > worst) worst = total;
        }

        hpById.clear();
        for (const [id, hp] of next) hpById.set(id, hp);
        flying = frame.bullets.filter((bullet) => bullet.state === 'flight').map((b) => b.id);
        return i >= 30 * 90;
      },
      30 * 90,
      engage,
      // Never a second chamber, never the blast and never Thorns: all three
      // would put a second body in the hurt count without a second bullet.
      (offers) =>
        offers.find(
          (id) => id !== 'extraChamber' && id !== 'explosive' && id !== 'thorns',
        ) ?? offers[0],
    );

    assert.ok(hurt.size > 0, 'the run shot and landed something');
    assert.equal(worst, 1, 'one bullet never hurts two zombies - there is no piercing');
  });
});

describe('cards in play', () => {
  test('XP is banked the instant a zombie dies, with nothing to walk over', () => {
    const { world, events } = harness(7, ARENA);

    const killed = runUntil(world, () => events.kills >= 1, 30 * 60, engage);
    assert.ok(killed >= 0, 'the survivor actually kills something');

    assert.ok(world.getFrame().xp >= 1, 'the kill paid out on the spot');
    assert.equal(
      'gems' in world.getFrame(),
      false,
      'and there is no gem left lying about to collect',
    );
  });

  test('Extra Chamber hands over the round it promises, not just an empty pip', () => {
    const { world } = harness(7, ARENA);

    // The frame is one reused object, so the "before" state is copied out.
    const live = () => {
      const frame = world.getFrame();
      return { chamber: frame.chamber, held: frame.held, airborne: frame.bullets.length };
    };

    const before = live();
    assert.equal(before.chamber, 1, 'the run opens with one slot');
    assert.equal(before.held + before.airborne, before.chamber, 'loaded and airborne match');

    world.offerCards(['extraChamber']);
    assert.equal(world.choose('extraChamber'), true);

    const after = live();
    assert.equal(after.chamber, before.chamber + 1, 'the chamber gains a slot');
    assert.equal(after.held, before.held + 1, 'and the new slot arrives loaded');
    assert.equal(
      after.held + after.airborne,
      after.chamber,
      'the card keeps the one invariant the round runs on',
    );
  });

  test('Boomerang flies home instead of dropping, and coming home re-arms', () => {
    const { world } = harness(7, ARENA);
    world.grantUpgrade('boomerang');

    const out = runUntil(
      world,
      () => world.getFrame().bullets.some((bullet) => bullet.state === 'return'),
      30 * 30,
      engage,
    );
    assert.ok(out >= 0, 'the bullet comes home rather than landing');
    assert.equal(world.getFrame().held, 0, 'and the chamber is still empty while it travels');

    const back = runUntil(world, () => world.getFrame().held >= 1, 30 * 30, engage);
    assert.ok(back >= 0, 'coming home puts the bullet back in the hand');
    assert.equal(
      world.getFrame().bullets.some((bullet) => bullet.state === 'ground'),
      false,
      'nothing was left lying about',
    );
  });

  test('Magnet drags a grounded bullet home, and it is taken only on touch', () => {
    const { world, events } = harness(7, ARENA);
    world.grantUpgrade('magnet', 3);
    // Never a second chamber: this run has exactly one bullet in it.
    const pick = (offers: readonly UpgradeId[]): UpgradeId =>
      offers.find((id) => id !== 'extraChamber') ?? offers[0];
    const touch = PLAYER_RADIUS + BULLET_RADIUS;

    // 1. Fire, and wait for one to come down beyond arm's reach.
    const landed = runUntil(
      world,
      () => {
        const frame = world.getFrame();
        const bullet = frame.bullets.find((b) => b.state === 'ground');
        if (!bullet) return false;
        return Math.hypot(bullet.x - frame.player.x, bullet.y - frame.player.y) > touch + 8;
      },
      30 * 60,
      engage,
      pick,
    );
    assert.ok(landed >= 0, 'a shot must come down somewhere');
    const id = world.getFrame().bullets.find((b) => b.state === 'ground')?.id;
    assert.ok(id !== undefined, 'and it is lying there waiting');

    // 2. Walk to the edge of the magnet's reach - no further.
    const reach = pickupRadiusFor(world.getFrame().stacks);
    const inReach = runUntil(
      world,
      () => {
        const frame = world.getFrame();
        const bullet = frame.bullets.find((b) => b.id === id);
        if (!bullet) return true;
        const d = Math.hypot(bullet.x - frame.player.x, bullet.y - frame.player.y);
        return d <= reach && d > touch;
      },
      30 * 60,
      (frame) => {
        const bullet = frame.bullets.find((b) => b.id === id);
        return bullet ? unit(bullet.x - frame.player.x, bullet.y - frame.player.y) : IDLE;
      },
      pick,
    );
    assert.ok(inReach >= 0, 'the survivor reaches the edge of the pull');
    assert.equal(world.getFrame().bullets.some((b) => b.id === id), true, 'and stops short of it');

    // 3. From here the player never moves again: the bullet has to come to it.
    const base = world.getFrame();
    const stillX = base.player.x;
    const stillY = base.player.y;
    const pickupsBefore = events.pickups;

    const carried = runUntil(world, () => events.pickups > pickupsBefore, 30 * 10, () => IDLE, pick);

    assert.ok(carried >= 0, 'a bullet inside the reach crawls the rest of the way in');
    assert.equal(events.pickups, pickupsBefore + 1, 'and it is taken exactly once');
    const after = world.getFrame();
    assert.equal(after.player.x, stillX, 'without the player taking a step for it');
    assert.equal(after.player.y, stillY);
    assert.equal(
      after.bullets.some((b) => b.id === id),
      false,
      'a collected bullet leaves the world',
    );
  });

  test('Blood Frenzy hands the bullet back the moment something dies', () => {
    const { world, events } = harness(7, ARENA);
    world.grantUpgrade('bloodFrenzy');

    const killed = runUntil(world, () => events.kills >= 1, 30 * 30, engage);
    assert.ok(killed >= 0, 'the run actually kills');

    assert.equal(world.getFrame().held, 1, 'the kill returned the bullet to the hand');
    assert.equal(
      world.getFrame().bullets.filter((bullet) => bullet.state === 'ground').length,
      0,
      'so there was nothing left to walk over',
    );
  });

  test('Explosive Round takes the block around the impact with it', () => {
    const { world, events } = harness(13, ARENA);
    world.grantUpgrade('explosive');

    let lastKills = 0;
    let biggestPack = 0;
    runUntil(
      world,
      (i) => {
        const delta = events.kills - lastKills;
        if (delta > biggestPack) biggestPack = delta;
        lastKills = events.kills;
        return i >= 30 * 90 - 1 || !world.getFrame().running;
      },
      30 * 90,
      engage,
      // Never a second chamber, never a second blast (each stack widens it)
      // and never Thorns - any of the three would blur the count.
      (offers) =>
        offers.find((id) => id !== 'extraChamber' && id !== 'explosive' && id !== 'thorns') ??
        offers[0],
    );

    assert.ok(events.explosions.length > 0, 'the card actually fires');
    assert.ok(
      events.explosions.every((event) => event.radius === EXPLOSIVE_RADIUS),
      'and reports the real blast radius',
    );
    // One bullet is in the air at a time (the chamber starts at one), so two
    // kills in a single step can only have come from the blast itself.
    assert.ok(biggestPack >= 2, `a blast took more than the one it hit, best was ${biggestPack}`);
  });

  test('Second Wind revives once, shoves the horde clear, and keeps the run going', () => {
    const { world, events } = harness(9, ARENA);
    world.grantUpgrade('secondWind');

    let revived = false;
    let cleared = false;
    let crowdBefore = Infinity;

    runUntil(
      world,
      () => {
        const frame = world.getFrame();
        const hp = events.hpHistory;
        const nearest = frame.enemies.reduce(
          (best, enemy) =>
            Math.min(best, Math.hypot(enemy.x - frame.player.x, enemy.y - frame.player.y)),
          Infinity,
        );
        if (hp.at(-1) === 1) crowdBefore = nearest; // the hit right before the fatal one

        // Read once, on the frame the revive landed on: the (1, 3) pair stays
        // at the tail of the history until the next hit, so a later frame would
        // be measured after the horde had already started closing back in.
        if (!revived && hp.length >= 2 && hp[hp.length - 2] === 1 && hp[hp.length - 1] === SECOND_WIND_HEARTS) {
          revived = true;
          cleared =
            frame.enemies.length > 0 &&
            crowdBefore < SECOND_WIND_PUSH &&
            frame.enemies.every((enemy) => {
              const d = Math.hypot(enemy.x - frame.player.x, enemy.y - frame.player.y);
              return d >= SECOND_WIND_PUSH - 1;
            });
        }
        return !world.getFrame().running;
      },
      30 * 90,
      () => IDLE,
      // Mend would fake the 1 -> 3 jump the assertion reads as a revive.
      (offers) => offers.find((id) => id !== 'mend') ?? offers[0],
    );

    assert.ok(revived, 'the fatal hit was spent on the card instead of the round');
    assert.ok(cleared, 'and the horde was shoved clear of the revive');
    assert.equal(events.hpHistory.at(-1), 0, 'the second death still lands');
    assert.equal(events.ends.length, 1, 'exactly one endRound - a revive is not a restart');
    assert.equal(world.getFrame().player.hp, 0);
  });
});

describe('level-up handshake', () => {
  test('fills the bar, freezes with cards, and takes exactly one', () => {
    const { world, events } = harness(9, ARENA);

    const reached = runUntil(
      world,
      () => world.getFrame().offers !== null,
      30 * 60,
      engage,
    );
    assert.ok(reached >= 0, 'the first upgrade should arrive during the first waves');

    const offers = world.getFrame().offers;
    assert.ok(offers, 'offers are on the frame');
    assert.ok(offers.length >= 1 && offers.length <= 3, 'one to three cards');
    assert.equal(new Set(offers).size, offers.length, 'no duplicate cards');
    assert.equal(events.levelUps.length, 1);

    const level = world.getFrame().level;
    const time = world.getFrame().time;
    const wave = world.getFrame().wave;
    const stacksBefore = { ...world.getFrame().stacks };

    // The world is frozen: stepping it must change nothing.
    for (let i = 0; i < 30; i++) world.step(STEP, IDLE);
    assert.equal(world.getFrame().time, time, 'a pending card freezes the round');
    assert.equal(world.getFrame().wave, wave, 'and with it the wave director');
    assert.equal(world.getFrame().level, level);
    assert.equal(world.getFrame().offers?.length, offers.length, 'and keeps offering');

    const allIds: UpgradeId[] = [
      'extraChamber',
      'quickHands',
      'longBarrel',
      'magnet',
      'sprint',
      'mend',
      'heavyRound',
      'grit',
      'boomerang',
      'shockwave',
      'explosive',
      'secondWind',
      'bloodFrenzy',
      'homing',
      'thorns',
      'dread',
    ];
    assert.equal(allIds.length, UPGRADES.length, 'the list below still describes the deck');
    const notOffered = allIds.find((id) => !offers.includes(id));
    assert.ok(notOffered, 'three cards cannot cover the whole deck');
    assert.equal(world.choose(notOffered), false, 'a card that was not offered');
    assert.equal(world.choose(offers[0]), true);
    assert.equal(world.getFrame().offers, null, 'the handshake is resolved');
    assert.equal(world.choose(offers[0]), false, 'the same card cannot be taken twice');
    assert.equal(events.choices.length, 1);

    const stacksAfter = world.getFrame().stacks;
    assert.ok(
      (Object.keys(stacksBefore) as UpgradeId[]).some((id) => stacksAfter[id] > stacksBefore[id]),
      'the chosen card is actually applied',
    );

    // And the round carries on.
    world.step(STEP, IDLE);
    assert.ok(world.getFrame().time > time);
  });
});

describe('run ending', () => {
  test('the run ends when the last heart goes, and reports exactly once', () => {
    const { world, events } = harness(21, ARENA);

    const done = runUntil(world, () => !world.getFrame().running, 30 * 60, () => IDLE);
    assert.ok(done >= 0, 'a player who never moves eventually falls');

    assert.equal(events.ends.length, 1, 'exactly one endRound per round');
    assert.equal(events.ends[0].win, true, 'an endless game always reports win: true');
    assert.equal(world.getFrame().win, true);
    assert.equal(world.getFrame().player.hp, 0);
    assert.equal(world.getFrame().phase, 'fight', 'the wave was never cleared');
    assert.equal(world.frozen(), true, 'a finished round may not be stepped');
  });

  test('the final score on the panel matches what the world reports', () => {
    const { world, events } = harness(23, ARENA);

    runUntil(world, () => !world.getFrame().running, 30 * 60, () => IDLE);

    const frame = world.getFrame();
    assert.equal(
      frame.score,
      events.ends[0].score,
      'HUD, Result Panel and bridge all read the same number',
    );
    assert.ok(events.ends[0].wave >= 1, 'the panel reports the wave that was reached');
    assert.equal(events.ends[0].level, frame.level);
  });
});
