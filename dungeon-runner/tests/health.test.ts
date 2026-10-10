// tests/health.test.ts — health is a fixed 3 HP: a hit costs exactly one heart
// and NOTHING but a heart pickup gives it back (tests/pickups.test.ts covers
// that side). Pure simulation, no renderer.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HEALTH } from '../src/config/gameConfig.ts';
import { buildGame, step, type Harness } from './helpers.ts';

const startTap = (h: Harness): void => h.game.handleAnyInput();

test('the knight starts every run with exactly 3 HP and an empty purse', () => {
  const h = buildGame();
  startTap(h);

  assert.equal(HEALTH.START_HEARTS, 3);
  assert.equal(HEALTH.MAX_HEARTS, 3);
  assert.equal(h.game.hearts, 3);
  assert.equal(h.game.maxHearts, 3);
  assert.equal(h.game.coins, 0, 'no coin is banked before the run starts');
});

test('a lost heart never comes back on its own', () => {
  const h = buildGame();
  startTap(h);
  assert.equal(h.game.hearts, 3);

  // A spike cluster scrolls onto the knight and takes the first heart.
  h.game.spawner.obstacles.push({
    type: 'spike_cluster',
    x: h.layout.knightX() + 80,
    active: true,
    spikeCount: 3,
    spikeH: 60,
  });
  for (let i = 0; i < 120 && h.game.hearts === 3; i++) step(h);
  assert.equal(h.game.hearts, 2, 'the hit costs exactly one heart');

  // Then a long run with no further danger — and no pickups either, so the
  // only way to heal (a heart pickup) is deliberately taken off the table.
  for (let i = 0; i < 1800; i++) {
    h.game.spawner.obstacles.length = 0;
    h.game.pickupSpawner.pickups.length = 0;
    step(h);
  }

  assert.equal(h.game.hearts, 2, 'running never regenerates a heart');
  assert.equal(h.game.state, 'playing', 'the run itself is unharmed');
});
