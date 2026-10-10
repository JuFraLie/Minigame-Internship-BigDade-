// tests/collision.test.ts — pure collision rules: which trap hurts the knight
// and which one it survives, with no renderer in sight.

import assert from 'node:assert/strict';
import test from 'node:test';

import { hitsObstacle, overlaps } from '../src/game/collision.ts';
import { Knight } from '../src/game/knight.ts';
import { obstacleHitbox, type Obstacle } from '../src/game/obstacles.ts';
import { makeLayout } from './helpers.ts';

const layout = makeLayout();

const knight = (): Knight => new Knight(layout.knightX(), layout.floorY(), layout.gameH);

const spike = (): Obstacle => ({
  type: 'spike_cluster',
  x: layout.knightX() + 80,
  active: true,
  spikeCount: 3,
  spikeH: 60,
});

const lowBat = (): Obstacle => ({
  type: 'flyer',
  x: layout.knightX() + 87,
  active: true,
  flyY: layout.floorY() - 55,
  flyPhase: 0,
});

const highBat = (): Obstacle => ({
  ...lowBat(),
  flyY: layout.floorY() - 110,
});

test('overlaps only when the rectangles genuinely intersect', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(overlaps(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(overlaps(a, { x: 10, y: 0, w: 10, h: 10 }), false, 'touching edges are not a hit');
  assert.equal(overlaps(a, { x: 20, y: 20, w: 5, h: 5 }), false);
});

test('a grounded knight dies on the spikes', () => {
  const k = knight();
  assert.equal(k.state, 'running');
  assert.equal(hitsObstacle(k, [spike()], layout.floorY()), true);
});

test('a jump clears the spikes entirely', () => {
  const k = knight();
  k.state = 'jumping';
  k.y = k.groundedY - 200;

  assert.equal(hitsObstacle(k, [spike()], layout.floorY()), false);
});

test('the shield does not save you from the spikes', () => {
  const k = knight();
  k.shield();
  assert.equal(k.isShielding, true);
  assert.equal(hitsObstacle(k, [spike()], layout.floorY()), true);
});

test('a low bat hits a running knight', () => {
  const k = knight();
  assert.equal(hitsObstacle(k, [lowBat()], layout.floorY()), true);
});

test('the shield deflects a low bat', () => {
  const k = knight();
  k.shield();
  assert.equal(hitsObstacle(k, [lowBat()], layout.floorY()), false);
});

test('a high bat can simply be run under', () => {
  const k = knight();
  assert.equal(hitsObstacle(k, [highBat()], layout.floorY()), false);
});

test('traps far to the right never touch the knight', () => {
  const k = knight();
  const far: Obstacle[] = [
    { ...spike(), x: layout.gameW + 40 },
    { ...lowBat(), x: layout.gameW + 40 },
  ];
  assert.equal(hitsObstacle(k, far, layout.floorY()), false);
});

test('a hitbox never depends on how the trap is drawn', () => {
  const box = obstacleHitbox(spike(), layout.floorY());
  assert.ok(box.w > 0 && box.h > 0);
  assert.ok(box.x >= layout.knightX(), 'the spike box starts on its own sprite');
  assert.ok(box.y + box.h <= layout.floorY() + 1, 'spikes never sink below the floor');
});
