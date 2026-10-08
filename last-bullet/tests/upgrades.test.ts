import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CrowdField } from '../src/core/CrowdField.ts';
import { EnemyWalk } from '../src/core/EnemyWalk.ts';
import { EnemyPool, type Enemy } from '../src/core/entities.ts';
import { GameWorld } from '../src/core/GameWorld.ts';
import { Progression } from '../src/core/Progression.ts';
import { Survivor } from '../src/core/Survivor.ts';
import { Weapon } from '../src/core/Weapon.ts';
import { RandomAdapter } from '../src/adapters/random/RandomAdapter.ts';
import { BULLET_SPEED, ENEMY_STATS, FIXED_STEP } from '../src/core/config.ts';
import type {
  UpgradeId,
  WorldEventsPort,
} from '../src/core/types.ts';
import { IDLE } from './support/survivor.ts';

/**
 * The cards in play, one level below the world: where an effect has to be
 * judged against exact geometry - how far a shove carries, which way a shot
 * bends, whether a returning round picks a stray up - a whole run would only
 * ever observe it by accident.
 *
 * These are the effects that were added together: the pair that only pays off
 * when two cards are held at once (Boomerang + Magnet), and the four cards
 * that reach outside the gun (Homing, Thorns, Shockwave, Dread).
 */

const STEP = FIXED_STEP;

/** Counts what a test asserts on; the rest of the events are none of its business. */
class Recorder implements WorldEventsPort {
  kills = 0;
  shots = 0;

  onRunEnded(): void {}
  onLevelUp(): void {}
  onEnemyKilled(): void {
    this.kills += 1;
  }
  onPlayerHit(): void {}
  onBulletFired(): void {
    this.shots += 1;
  }
  onBulletPickedUp(): void {}
  onExplosion(): void {}
  onUpgradeChosen(): void {}
}

// ---------------------------------------------------------------------------
// A weapon, wired by hand: pools, one body, one card stack.
// ---------------------------------------------------------------------------

interface Gun {
  readonly weapon: Weapon;
  readonly enemies: EnemyPool;
  readonly field: CrowdField;
  readonly progression: Progression;
}

const gun = (): Gun => {
  const events = new Recorder();
  const enemies = new EnemyPool(8);
  const field = new CrowdField(8);
  const progression = new Progression(new RandomAdapter(3), events);
  const weapon = new Weapon({
    enemies,
    field,
    survivor: new Survivor(),
    progression,
    events,
    kills: { onEnemyDown: () => {} },
  });
  return { weapon, enemies, field, progression };
};

/** Stands a body at `(x, y)` and puts it in the field; returns its slot. */
const stand = (fx: Gun, x: number, y: number): number => {
  const slot = fx.enemies.claim();
  const body = fx.enemies.items[slot];
  const stats = ENEMY_STATS.zombie;
  body.kind = 'zombie';
  body.x = x;
  body.y = y;
  body.radius = stats.radius;
  body.hp = stats.hp;
  body.maxHp = stats.hp;
  body.speed = 0;
  body.damage = stats.damage;
  body.xp = stats.xp;
  fx.field.rebuild(fx.enemies.items);
  return slot;
};

/** Steps the weapon until `done`, or -1 if it never gets there. */
const runGun = (fx: Gun, done: () => boolean, maxSteps: number): number => {
  for (let i = 0; i < maxSteps; i++) {
    if (done()) return i;
    fx.weapon.tick(STEP);
    fx.weapon.step(STEP);
  }
  return done() ? maxSteps : -1;
};

/** Fires one round and parks it as `state` at `(x, y)`, ready to be stepped. */
const load = (
  fx: Gun,
  state: 'return' | 'ground',
  x: number,
  y: number,
  targetX: number,
  targetY: number,
): void => {
  stand(fx, targetX, targetY);
  fx.weapon.tryFire();
  const shot = fx.weapon.bullets.items.find((bullet) => bullet.alive);
  assert.ok(shot, 'the shot left the chamber');
  shot.state = state;
  shot.x = x;
  shot.y = y;
};

describe('Boomerang and Magnet, together', () => {
  /** A round lying well outside any pull: 200 out, and Magnet reaches 148. */
  const STRAY = { x: 200, y: 0 };

  test('sweep the stray up as the round on its way home passes over it', () => {
    const fx = gun();
    fx.progression.grant('boomerang', 1);
    fx.progression.grant('magnet', 1);
    fx.progression.grant('extraChamber', 1); // two slots: one for the shot, one for the stray

    load(fx, 'return', 260, 0, 120, 0);
    const straySlot = fx.weapon.bullets.claim();
    const stray = fx.weapon.bullets.items[straySlot];
    stray.state = 'ground';
    stray.x = STRAY.x;
    stray.y = STRAY.y;

    const swept = runGun(fx, () => fx.weapon.bullets.count === 0, 60);
    assert.ok(swept >= 0, 'the return trip reaches the round lying out there');
    assert.equal(fx.weapon.held, 2, 'and both rounds end up back in the chamber');
  });

  test('is a sweep, not a crawl: Magnet alone never gets that far', () => {
    const fx = gun();
    fx.progression.grant('magnet', 3); // the pull reaches 148, the stray sits at 200

    const straySlot = fx.weapon.bullets.claim();
    const stray = fx.weapon.bullets.items[straySlot];
    stray.state = 'ground';
    stray.x = STRAY.x;
    stray.y = STRAY.y;

    assert.equal(runGun(fx, () => !stray.alive, 60), -1, 'no card can drag it in from there');
    assert.equal(stray.alive, true, 'it waits to be walked over, exactly as it always did');
  });

  test('is a sweep, not a return: Boomerang alone brings home only its own round', () => {
    const fx = gun();
    fx.progression.grant('boomerang', 1);
    fx.progression.grant('extraChamber', 1);

    load(fx, 'return', 260, 0, 120, 0);
    const straySlot = fx.weapon.bullets.claim();
    const stray = fx.weapon.bullets.items[straySlot];
    stray.state = 'ground';
    stray.x = STRAY.x;
    stray.y = STRAY.y;

    const home = runGun(fx, () => fx.weapon.held >= 1, 60);
    assert.ok(home >= 0, 'Boomerang still flies its own round home');
    assert.equal(fx.weapon.held, 1, 'so the chamber takes that one back, and no more');
    assert.equal(stray.alive, true, 'and leaves the stray where it fell');
  });
});

describe('Homing Round', () => {
  /** A shot aimed straight down +x, with the only body off to the side. */
  const bentShot = (homing: boolean): { angle: number; speed: number } => {
    const fx = gun();
    if (homing) fx.progression.grant('homing', 1);

    const target = stand(fx, 200, 0);
    fx.weapon.tryFire();
    const shot = fx.weapon.bullets.items.find((bullet) => bullet.alive);
    assert.ok(shot, 'the shot left the chamber');
    assert.equal(shot.angle, 0, 'the shot was aimed level before anything moved');

    // The body steps off the flight line after the shot is away: the round
    // has been aimed already, so only the card can turn it now.
    fx.enemies.items[target].x = 250;
    fx.enemies.items[target].y = 120;
    fx.field.rebuild(fx.enemies.items);

    for (let i = 0; i < 5; i++) {
      fx.weapon.tick(STEP);
      fx.weapon.step(STEP);
    }
    return { angle: shot.angle, speed: Math.hypot(shot.vx, shot.vy) };
  };

  test('bends a straight shot toward whatever stands beside its path', () => {
    const { angle, speed } = bentShot(true);

    assert.ok(angle > 0.2, `the round turned ${angle.toFixed(3)} rad toward the body`);
    assert.ok(angle < 1, 'but only as far as the card lets it - no circling');
    assert.ok(
      Math.abs(speed - BULLET_SPEED) < 1e-9,
      'and it keeps every unit of its speed: only the direction is bought',
    );
  });

  test('does nothing at all when the card has not been taken', () => {
    assert.equal(bentShot(false).angle, 0, 'a plain shot keeps the line it was fired on');
  });
});

// ---------------------------------------------------------------------------
// The two cards that act on the crowd rather than on the gun.
// ---------------------------------------------------------------------------

const horde = () => {
  const pool = new EnemyPool(8);
  const field = new CrowdField(8);
  const walk = new EnemyWalk(pool, field);
  const body = (x: number, y: number, speed = 100): Enemy => {
    const slot = pool.claim();
    const enemy = pool.items[slot];
    const stats = ENEMY_STATS.zombie;
    enemy.kind = 'zombie';
    enemy.x = x;
    enemy.y = y;
    enemy.speed = speed;
    enemy.radius = stats.radius;
    enemy.hp = stats.hp;
    enemy.maxHp = stats.hp;
    enemy.damage = stats.damage;
    enemy.xp = stats.xp;
    return enemy;
  };
  return { pool, field, walk, body };
};

describe('Shockwave', () => {
  test('pushes out of the kill hardest at the centre, and not at all past the rim', () => {
    const { walk, body } = horde();
    const centre = body(0, 0);
    const near = body(30, 0);
    const rim = body(99, 0);
    const beyond = body(150, 0);

    walk.pushFrom(0, 0, 100, 50);

    assert.equal(centre.x, 0, 'the epicentre has no way to face, so it is left alone');
    assert.ok(Math.abs(near.x - 65) < 1e-9, '30 out takes 35 of the shove, since 30/100 is spent');
    assert.equal(near.y, 0, 'straight out of the blast, never sideways');
    assert.ok(rim.x > 99 && rim.x < 100, 'the rim barely stirs');
    assert.equal(beyond.x, 150, 'and outside the reach nothing moves at all');
  });

  test('refuses to shove nothing, so an empty blast costs nothing', () => {
    const { walk, body } = horde();
    const idle = body(10, 10);

    walk.pushFrom(0, 0, 0, 60);

    assert.equal(idle.x, 10, 'zero reach means zero movement');
    assert.equal(idle.y, 10);
  });
});

describe('Dread', () => {
  /** How far one step carries a body at `(0, -100)` walking into the origin. */
  const advance = (pace: number): number => {
    const { pool, field, walk, body } = horde();
    const enemy = body(0, -100);
    field.rebuild(pool.items);
    walk.step(STEP, 0, 0, pace);
    return enemy.y + 100; // it walks up the y axis, so closing is a rise
  };

  test('takes a straight share off the horde, and never the whole of it', () => {
    const full = advance(1);
    const slowed = advance(0.5);

    assert.ok(Math.abs(full - 100 / 30) < 1e-9, 'a full pace covers exactly its own speed');
    assert.ok(Math.abs(slowed - full / 2) < 1e-9, 'half a pace covers half the ground');
    assert.equal(advance(0), 0, 'and nothing at all stands still');
  });
});

describe('Thorns', () => {
  test('a body that reaches the survivor pays for the touch, with no shot to blame', () => {
    const events = new Recorder();
    const world = new GameWorld(new RandomAdapter(4), events);
    world.setViewSize(700, 1400);
    world.grantUpgrade('thorns', 3);
    assert.equal(world.seedRing(12), 12, 'the ring comes in from every side');

    // Nothing that hands a round back mid-run: the chamber has to stay empty
    // for "no bullet fired this step" to be something the test can read.
    const pick = (offers: readonly UpgradeId[]): UpgradeId =>
      offers.find(
        (id) => id !== 'extraChamber' && id !== 'boomerang' && id !== 'bloodFrenzy',
      ) ?? offers[0];

    let spiked = -1;
    for (let i = 0; i < 30 * 90 && spiked < 0; i++) {
      const frame = world.getFrame();
      if (frame.offers !== null) {
        world.choose(pick(frame.offers));
        continue;
      }

      // The round is out and every round in the world is lying on the ground,
      // which hurts nobody: whatever dies this step dies of the spikes.
      const quiet =
        frame.held === 0 &&
        frame.bullets.length > 0 &&
        frame.bullets.every((bullet) => bullet.state === 'ground');

      const before = events.kills;
      world.step(STEP, IDLE);
      if (quiet && events.kills > before) spiked = i;
    }

    assert.ok(spiked >= 0, 'the survivor never fired that step, so the spikes took the body');
    assert.ok(events.shots > 0, 'and it really was a touch: the run had been shooting');
    assert.ok(world.getFrame().player.hp > 0, 'and the survivor is still standing');
  });
});
