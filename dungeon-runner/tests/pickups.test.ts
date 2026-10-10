// tests/pickups.test.ts — the coin and heart pickups: the spawn clock, the
// scroll, what a coin pays and what a heart heals.
// Everything here is driven through the controller's ports, so the game logic
// runs headless — no renderer, no DOM (AGENTS.md §4.3).

import assert from 'node:assert/strict';
import test from 'node:test';

import { HEALTH, PICKUPS, SCORING } from '../src/config/gameConfig.ts';
import { resultButtons } from '../src/core/uiLayout.ts';
import { pickupHitbox, PickupSpawner, type Pickup } from '../src/game/pickups.ts';
import { buildGame, DT, forceDeath, step, type Harness } from './helpers.ts';

const startTap = (h: Harness): void => h.game.handleAnyInput();
const cue = (h: Harness, name: string): number =>
  h.audio.calls.filter(call => call === name).length;

/** Drops an item `dx` px in front of the knight, `aboveFloor` px above the floor. */
function drop(h: Harness, type: Pickup['type'], dx: number, aboveFloor: number): Pickup {
  const p: Pickup = {
    type,
    x: h.layout.knightX() + dx,
    y: h.layout.floorY() - aboveFloor,
    baseY: h.layout.floorY() - aboveFloor,
    active: true,
    radius: type === 'coin' ? PICKUPS.COIN_RADIUS : PICKUPS.HEART_RADIUS,
    animPhase: 0,
  };
  h.game.pickupSpawner.pickups.push(p);
  return p;
}

/** Parks an item right on the knight's body, so the very next frame collects it. */
function placeOnKnight(h: Harness, type: Pickup['type']): Pickup {
  const box = h.game.knight.getHitbox();
  const p: Pickup = {
    type,
    x: box.x + box.w / 2,
    y: box.y + box.h / 2,
    baseY: box.y + box.h / 2,
    active: true,
    radius: type === 'coin' ? PICKUPS.COIN_RADIUS : PICKUPS.HEART_RADIUS,
    animPhase: 0,
  };
  h.game.pickupSpawner.pickups.push(p);
  return p;
}

test('the collect box is centred on the item and wider than the drawn coin', () => {
  const box = pickupHitbox({
    type: 'coin',
    x: 100,
    y: 50,
    baseY: 50,
    active: true,
    radius: PICKUPS.COIN_RADIUS,
    animPhase: 0,
  });
  const r = PICKUPS.COIN_RADIUS + PICKUPS.COLLECT_BONUS;

  assert.equal(box.x, 100 - r);
  assert.equal(box.y, 50 - r);
  assert.equal(box.w, r * 2);
  assert.equal(box.h, r * 2);
  assert.ok(
    PICKUPS.COLLECT_BONUS > 0,
    'a jump through a pattern must take the whole line, not just the pixels',
  );
});

test('the pickup clock keeps offering coin patterns during a run', () => {
  const h = buildGame();
  startTap(h);

  let patternsOffered = 0;
  let framesWithPickups = 0;
  let widestPattern = 0;
  let prevCount = 0;

  // 2400 frames = 38.4 s of running. A pattern now waits for the trap it
  // belongs to (≤ one pacing gap, 5 s), so at 10–16 s apart the worst case is
  // 10 + 5 + 16 + 5 = 36 s — two patterns fit no matter how the rolls fall.
  for (let frame = 0; frame < 2400; frame++) {
    h.game.spawner.obstacles.length = 0; // keep the run alive; traps are not the subject
    step(h);
    if (h.game.state === 'dead') break;

    const alive = h.game.pickupSpawner.pickups.length;
    // A fresh pattern always pushes a whole line at once, so any growth of the
    // array means the clock fired again (a pattern only ever shrinks after).
    if (alive > prevCount) patternsOffered++;
    prevCount = alive;
    if (alive > 0) framesWithPickups++;
    widestPattern = Math.max(widestPattern, alive);
  }

  assert.equal(h.game.state, 'playing', 'the sample run never ended');
  assert.ok(
    patternsOffered >= 2,
    `the clock only offered ${patternsOffered} patterns in 2400 frames`,
  );
  assert.ok(
    framesWithPickups > 90,
    `only ${framesWithPickups} of 2400 frames had a pickup on screen`,
  );
  assert.ok(
    widestPattern >= PICKUPS.COIN_MIN_PER_PATTERN,
    'a pattern is a whole line of coins, not a single one',
  );
});

test('pickups move only with the world and are culled off the left edge', () => {
  const gameW = 390;
  const floorY = 633;
  const spawner = new PickupSpawner();

  spawner.spawnHeart(gameW, floorY);
  const heart = spawner.pickups[0];
  assert.ok(heart, 'the heart exists');
  assert.ok(heart.x > gameW, 'a heart is born just past the right edge');
  assert.equal(heart.y, floorY - PICKUPS.HEART_SPAWN_OFFSET, 'hearts hover at running height');

  const startX = heart.x;
  spawner.scroll(240, 0.5);
  assert.ok(heart.x < startX, 'a pickup never moves on its own');

  // Forty seconds of running: at 10–16 s apart the clock keeps offering, and
  // nothing that has left the playfield is still being simulated.
  let widest = 0;
  for (let t = 0; t < 40; t += DT) {
    spawner.scroll(400, DT);
    spawner.update(DT, gameW, floorY);
    widest = Math.max(widest, spawner.pickups.length);
  }

  assert.ok(
    spawner.pickups.every(p => p.x + PICKUPS.CULL_MARGIN >= 0),
    'nothing lingers off screen',
  );
  assert.ok(widest >= PICKUPS.COIN_MIN_PER_PATTERN, 'the clock kept offering coins');
});

test('a coin pays its 25 points, counts in the HUD and plays its cue', () => {
  const h = buildGame();
  startTap(h);
  step(h, 5);

  const scoreBefore = h.game.score;
  const coin = placeOnKnight(h, 'coin');
  step(h, 1);

  assert.equal(coin.active, false, 'a collected coin can never pay twice');
  assert.equal(h.game.coins, 1, 'the coin is banked for the HUD');
  assert.equal(cue(h, 'coin'), 1, 'the coin cue plays exactly once');

  const gained = h.game.score - scoreBefore;
  const expected = DT * SCORING.POINTS_PER_SECOND + PICKUPS.COIN_POINTS;
  assert.ok(Math.abs(gained - expected) < 1e-6, `a coin pays ${PICKUPS.COIN_POINTS} on top of the run`);
});

test('ground coins are run over, air coins only with a jump', () => {
  const h = buildGame();
  startTap(h);

  // ── Ground line: no input needed ───────────────────────────────────────────
  const ground = drop(h, 'coin', 150, PICKUPS.GROUND_COIN_OFFSET);
  let collected = false;
  for (let i = 0; i < 60 && !collected; i++) {
    step(h);
    collected = !ground.active;
  }
  assert.ok(collected, 'a grounded knight picks up a ground coin by running');

  // ── Air line: the same coin is out of reach while he stays on the floor ───
  step(h, 12); // past RULES.START_INPUT_DELAY, so the next tap really jumps
  const air = drop(h, 'coin', 130, PICKUPS.AIR_COIN_OFFSET);
  for (let i = 0; i < 45; i++) step(h);
  assert.equal(air.active, true, 'he cannot reach the air line without jumping');
  assert.equal(h.game.knight.state, 'running', 'he never left the floor');

  // ── …and collectible as soon as he jumps through it ───────────────────────
  const air2 = drop(h, 'coin', 130, PICKUPS.AIR_COIN_OFFSET);
  h.input.press('jump');
  collected = false;
  for (let i = 0; i < 60 && !collected; i++) {
    step(h);
    collected = !air2.active;
  }
  assert.ok(collected, 'a jump reaches the very same coin');
});

test('one jump sweeps a whole air line — no coin is left behind', () => {
  const h = buildGame();
  startTap(h);
  step(h, 12); // past RULES.START_INPUT_DELAY, so the tap really jumps

  // A full air pattern as the spawner lays it out: a tight line of coins at
  // the jump-apex height, born just ahead of the knight.
  const line: Pickup[] = [];
  const y = h.layout.floorY() - PICKUPS.AIR_COIN_OFFSET;
  for (let i = 0; i < PICKUPS.COIN_MAX_PER_PATTERN; i++) {
    const p: Pickup = {
      type: 'coin',
      x: h.layout.knightX() + 130 + i * PICKUPS.COIN_SPACING,
      y,
      baseY: y,
      active: true,
      radius: PICKUPS.COIN_RADIUS,
      animPhase: 0,
    };
    h.game.pickupSpawner.pickups.push(p);
    line.push(p);
  }

  h.input.press('jump'); // the player jumps straight through the pattern

  let collected = 0;
  for (let frame = 0; frame < 90 && collected < line.length; frame++) {
    step(h);
    if (h.game.state !== 'playing') break;
    collected = line.filter(p => !p.active).length;
  }

  assert.equal(
    collected,
    line.length,
    `one jump must take all ${line.length} coins, took ${collected}`,
  );
  assert.equal(h.game.coins, line.length, 'every swept coin is paid for');
});

test('the coin milestone offers a heart — but only while one is missing', () => {
  const h = buildGame();
  startTap(h);

  // Full health: the milestone is HELD instead of spawning a wasted heart.
  h.game.coinsSinceHeart = PICKUPS.HEART_BASE_COIN_THRESHOLD;
  placeOnKnight(h, 'coin');
  step(h);

  assert.equal(h.game.coins, 1);
  assert.equal(
    h.game.pickupSpawner.pickups.some(p => p.type === 'heart'),
    false,
    'no heart is offered while the row is full',
  );
  assert.equal(
    h.game.coinsSinceHeart,
    PICKUPS.HEART_BASE_COIN_THRESHOLD + 1,
    'the milestone waits instead of being spent',
  );

  // The first hit opens the gate: the very next coin drops the promised heart.
  h.game.hearts = 2;
  placeOnKnight(h, 'coin');
  step(h);

  const heart = h.game.pickupSpawner.pickups.find(p => p.type === 'heart');
  assert.ok(heart, 'the heart is offered as soon as one is missing');
  assert.ok(heart.x > h.layout.gameW, 'it is born past the right edge, never on top of the knight');
  assert.equal(h.game.hearts, 2, 'it still has to be picked up');
  assert.equal(h.game.coinsSinceHeart, 0, 'the milestone is spent');
  assert.equal(
    h.game.coinsForNextHeart,
    PICKUPS.HEART_BASE_COIN_THRESHOLD + PICKUPS.HEART_COIN_THRESHOLD_INCREMENT,
    'every heart after the first costs more coins than the last',
  );
});

test('a heart restores exactly one heart and never overheals', () => {
  const h = buildGame();
  startTap(h);

  h.game.hearts = 2;
  const first = placeOnKnight(h, 'heart');
  step(h);

  assert.equal(h.game.hearts, 3, 'the heart restores one HP');
  assert.equal(first.active, false, 'a collected heart can never heal twice');
  assert.equal(cue(h, 'heart'), 1, 'the heart cue plays exactly once');

  const second = placeOnKnight(h, 'heart');
  step(h);

  assert.equal(h.game.hearts, HEALTH.MAX_HEARTS, 'no overheal past the maximum');
  assert.equal(second.active, false, 'it is still consumed, just without the HP');
});

test('Retry empties the purse and the field for the next round', () => {
  const h = buildGame();
  startTap(h);

  placeOnKnight(h, 'coin');
  step(h);
  assert.equal(h.game.coins, 1);

  forceDeath(h);
  step(h);
  assert.equal(h.game.state, 'dead');

  const { restart } = resultButtons(h.layout.gameW, h.layout.gameH);
  h.pointer.tapAt(restart.x + restart.w / 2, restart.y + restart.h / 2);
  step(h);

  assert.equal(h.game.state, 'playing');
  assert.equal(h.game.coins, 0, 'the new run starts with an empty purse');
  assert.equal(h.game.pickupSpawner.pickups.length, 0, 'the field is swept clean');
  assert.equal(h.game.hearts, HEALTH.START_HEARTS);
  assert.equal(h.game.coinsForNextHeart, PICKUPS.HEART_BASE_COIN_THRESHOLD);
});
