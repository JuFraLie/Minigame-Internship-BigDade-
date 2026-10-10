// tests/arrow.test.ts — the shield-only arrow stack: how it spawns, how it
// hits, and the promise the design is built on: NO jump can ever clear the
// wall, but a well-timed shield raise always can.

import assert from 'node:assert/strict';
import test from 'node:test';

import { KNIGHT, OBSTACLES, PHYSICS } from '../src/config/gameConfig.ts';
import { hitsObstacle } from '../src/game/collision.ts';
import { Knight } from '../src/game/knight.ts';
import { obstacleHitbox, ObstacleSpawner, type Obstacle } from '../src/game/obstacles.ts';
import { unlockScore } from '../src/game/pacing.ts';
import { scrollSpeed } from '../src/game/scoring.ts';
import { makeLayout } from './helpers.ts';

const layout = makeLayout();
const floorY = layout.floorY();
const SPEED = 220; // reference scroll speed for the timing maths
const STEP = 1 / 120;

/** Height above the floor of the top edge of arrow `i` in a stack. */
const arrowOffset = (i: number): number =>
  OBSTACLES.ARROW_Y_OFFSET + i * OBSTACLES.ARROW_STACK_SPACING;

/** The stack exactly as the spawner builds it: every arrow at ONE x, stepped upwards. */
function stack(x = layout.gameW + 20): Obstacle[] {
  return Array.from({ length: OBSTACLES.ARROW_COUNT }, (_, i) => ({
    type: 'arrow' as const,
    x,
    active: true,
    arrowY: floorY - arrowOffset(i),
  }));
}

const knight = (): Knight => new Knight(layout.knightX(), floorY, layout.gameH);

/**
 * Runs one attempt: the stack scrolls left at the reference speed, the knight
 * takes exactly ONE jump at `jumpAt` seconds (or never, when it is null),
 * optionally one shield raise at `shieldAt`.
 * @returns the time of the first hit, or null when the knight survives.
 */
function simulate(jumpAt: number | null, shieldAt: number | null): number | null {
  const k = knight();
  const arrows = stack();
  let jumped = false;
  let shielded = false;

  for (let t = 0; t < 2.6; t += STEP) {
    if (shieldAt !== null && !shielded && t >= shieldAt) {
      k.shield();
      shielded = true;
    }
    if (jumpAt !== null && !jumped && t >= jumpAt) {
      k.jump();
      jumped = true;
    }
    for (const a of arrows) a.x -= SPEED * STEP;
    k.update(STEP);
    if (hitsObstacle(k, arrows, floorY)) return t;
  }
  return null;
}

test('a running knight dies to an arrow at body height', () => {
  const arrow: Obstacle = {
    type: 'arrow',
    x: layout.knightX() + 60,
    active: true,
    arrowY: floorY - OBSTACLES.ARROW_Y_OFFSET,
  };
  assert.equal(hitsObstacle(knight(), [arrow], floorY), true);
});

test('the shield deflects arrows — nothing else does', () => {
  const arrow: Obstacle = {
    type: 'arrow',
    x: layout.knightX() + 60,
    active: true,
    arrowY: floorY - OBSTACLES.ARROW_Y_OFFSET,
  };
  const k = knight();
  k.shield();
  assert.equal(hitsObstacle(k, [arrow], floorY), false);
});

test('the arrow hitbox stays inside the drawn art (forgiving)', () => {
  const arrow = stack()[0];
  const hit = obstacleHitbox(arrow, floorY);
  assert.ok(hit.w > 0 && hit.h > 0);
  assert.ok(hit.x >= arrow.x);
  assert.ok(hit.x + hit.w <= arrow.x + OBSTACLES.ARROW_W);
  assert.ok(hit.y >= (arrow.arrowY ?? 0));
  assert.ok(hit.y + hit.h <= (arrow.arrowY ?? 0) + OBSTACLES.ARROW_H);
});

test('the stack reaches higher than any jump can carry the knight', () => {
  const k = knight();
  const grounded = k.getHitbox();
  // How high the hitbox's bottom sits when the knight stands on the floor …
  const clearance = floorY - (grounded.y + grounded.h);
  // … plus the highest jump physics allows.
  const apex = (PHYSICS.JUMP_VELOCITY * PHYSICS.JUMP_VELOCITY) / (2 * PHYSICS.GRAVITY);
  const reach = clearance + apex;

  const top = arrowOffset(OBSTACLES.ARROW_COUNT - 1);
  assert.ok(
    top > reach,
    `the top of the stack (${top}px) must sit above the knight's reach (${reach.toFixed(1)}px)`,
  );

  // …and the holes between two arrows are narrower than the knight himself,
  // so he can neither sail over the wall nor slip through a gap.
  const gap = OBSTACLES.ARROW_STACK_SPACING - OBSTACLES.ARROW_HIT_H;
  assert.ok(gap < grounded.h, `a ${gap}px gap must not fit a ${grounded.h.toFixed(1)}px hitbox`);
});

test('no jump can clear the stack, whenever it is started', () => {
  // Whatever moment he picks for his one jump, the wall catches him: too tall
  // to sail over, too tightly stacked to slip between.
  for (let t0 = 0.2; t0 < 2.4; t0 += 0.05) {
    const hit = simulate(t0, null);
    assert.ok(hit !== null, `a jump at t=${t0.toFixed(2)}s must still be hit`);
  }
});

test('running into the stack without a shield is fatal', () => {
  assert.ok(simulate(null, null) !== null);
});

test('the shield lasts exactly one knight_shield animation', () => {
  assert.equal(
    PHYSICS.SHIELD_DURATION,
    KNIGHT.FRAMES.shielding * KNIGHT.FRAME_DURATION.shielding,
    'the block goes up for the length of the raise you see on screen — nothing more',
  );
});

test('one shield raise covers the whole stack when timed before impact', () => {
  // The wall reaches the knight ≈1.23s after it spawns and sweeps past in
  // ~0.33s; a raise a beat earlier lasts exactly one animation and still
  // covers the crossing.
  assert.equal(simulate(null, 1.0), null);
});

test('a raise held too early expires before the wall is through', () => {
  // The shield is short now: started at 0.85s it is gone by 1.45s, while the
  // stack is still sweeping through the knight.
  const hit = simulate(null, 0.85);
  assert.ok(hit !== null, 'the early raise must run out before the wall passes');
  assert.ok(
    hit >= 0.85 + PHYSICS.SHIELD_DURATION - 1e-9,
    'the hit lands only after the shield expired',
  );
});

test('the spawner emits one stack: a single x, stepped upwards from the floor', () => {
  const original = Math.random;
  Math.random = () => 0.9; // the last slot of the phase's menu → the arrow stack
  try {
    const spawner = new ObstacleSpawner();
    const score = unlockScore('arrow') + 50;
    spawner.update(OBSTACLES.GRACE_PERIOD + 0.1, score, layout.gameW, floorY);

    const arrows = spawner.obstacles;
    assert.equal(arrows.length, OBSTACLES.ARROW_COUNT);
    assert.ok(arrows.every(o => o.type === 'arrow'));

    const x = layout.gameW + OBSTACLES.DANGER_LEAD_SECONDS * scrollSpeed(score);
    assert.ok(
      arrows.every(o => o.x === x),
      'every arrow of the stack shares one x, spawned at the warning distance',
    );

    arrows.forEach((o, i) => {
      assert.equal(o.arrowY, floorY - arrowOffset(i), `arrow ${i} sits one step higher`);
    });

    const offsets = arrows.map(o => (o.arrowY ?? 0));
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => b - a),
      'the stack is built upwards from the floor',
    );
    assert.ok(
      arrows.every(o => o.x > layout.gameW),
      'the whole stack starts off screen',
    );
  } finally {
    Math.random = original;
  }
});

test('arrows only appear after their unlock score', () => {
  const original = Math.random;
  Math.random = () => 0.9; // would win the roll, but the phase's menu forbids it
  try {
    const spawner = new ObstacleSpawner();
    spawner.update(OBSTACLES.GRACE_PERIOD + 0.1, unlockScore('arrow') - 1, layout.gameW, floorY);

    assert.ok(spawner.obstacles.every(o => o.type !== 'arrow'));
    assert.equal(spawner.obstacles[0]?.type, 'spike_cluster');
  } finally {
    Math.random = original;
  }
});
