// tests/coinTraps.test.ts — every coin pattern BELONGS to a trap: the coins
// are laid out in the lane that CLEARS it, they are always born off screen,
// and a corridor with no trap still pays out on time. Headless, through the
// public ports only (AGENTS.md §4.3).

import assert from 'node:assert/strict';
import test from 'node:test';

import { OBSTACLES, PICKUPS } from '../src/config/gameConfig.ts';
import type { TrapPreview } from '../src/core/types.ts';
import { Knight } from '../src/game/knight.ts';
import { trapPreview, type Obstacle } from '../src/game/obstacles.ts';
import { pickupHitbox, PickupSpawner, type Pickup } from '../src/game/pickups.ts';
import { buildGame, DT, makeLayout, step } from './helpers.ts';

const GAME_W = 390;
const FLOOR_Y = 633;

/** One big frame, so the clock offers exactly one pattern for `trap`. */
function patternFor(trap: TrapPreview | null, gameW: number = GAME_W, floorY: number = FLOOR_Y): Pickup[] {
  const spawner = new PickupSpawner();
  spawner.update(PICKUPS.SPAWN_INTERVAL_MIN + 0.1, gameW, floorY, trap);
  return spawner.pickups.sort((a, b) => a.x - b.x);
}

const above = (p: Pickup, floorY: number): number => floorY - p.y;

// ─── What a trap asks for ─────────────────────────────────────────────────────

test('the preview names the counter that clears every trap', () => {
  const floorY = FLOOR_Y;

  const spikes: Obstacle = { type: 'spike_cluster', x: 500, active: true, spikeCount: 4, spikeH: 40 };
  const spikeLane = trapPreview(spikes, floorY);
  assert.equal(spikeLane.counter, 'jump', 'spikes are answered by a jump');
  assert.equal(spikeLane.x, 500, 'the preview sits on the trap itself');
  assert.equal(
    spikeLane.width,
    4 * OBSTACLES.SPIKE_W - OBSTACLES.SPIKE_OVERLAP,
    'the arc spans exactly the cluster it belongs to',
  );

  const wall: Obstacle = { type: 'arrow', x: 500, active: true, arrowY: floorY - OBSTACLES.ARROW_Y_OFFSET };
  assert.equal(trapPreview(wall, floorY).counter, 'shield', 'an arrow wall is the shield');
  assert.equal(trapPreview(wall, floorY).width, OBSTACLES.ARROW_W);

  const lowBat: Obstacle = {
    type: 'flyer', x: 500, active: true, flyY: floorY - OBSTACLES.LOW_BAT_OFFSET, flyPhase: 0,
  };
  assert.equal(trapPreview(lowBat, floorY).counter, 'shield', 'a low bat is the shield');

  const highBat: Obstacle = {
    type: 'flyer', x: 500, active: true, flyY: floorY - OBSTACLES.HIGH_BAT_OFFSET, flyPhase: 0,
  };
  assert.equal(trapPreview(highBat, floorY).counter, 'run_under', 'a high bat is run under');
  assert.equal(trapPreview(highBat, floorY).width, 0, 'a bat is a point, not a span');
});

// ─── The lane each counter gets ───────────────────────────────────────────────

test('spike coins arc over the cluster and never land inside it', () => {
  const width = 4 * OBSTACLES.SPIKE_W - OBSTACLES.SPIKE_OVERLAP;
  const trap: TrapPreview = { counter: 'jump', x: GAME_W + 40, width };
  const coins = patternFor(trap);

  assert.equal(coins.length, PICKUPS.ARC_COIN_COUNT, 'an arc is a whole arc');
  assert.ok(
    coins[0].x < trap.x && coins[coins.length - 1].x > trap.x + width,
    'the first coin is taken off the floor BEFORE the spikes, the last one lands beyond them',
  );

  const peak = coins[Math.floor(coins.length / 2)];
  assert.ok(
    Math.abs(peak.x - (trap.x + width / 2)) < 1e-6,
    'the apex of the arc sits over the middle of the cluster',
  );
  assert.ok(
    Math.abs(above(peak, FLOOR_Y) - PICKUPS.ARC_PEAK_OFFSET) < 1e-6,
    'the apex is the jump apex, so one jump takes the whole arc',
  );

  assert.ok(
    coins.every(c => c.x >= GAME_W),
    `a pattern is born off screen, not at x=${Math.min(...coins.map(c => c.x))}`,
  );
});

test('shield-lane coins sit at shield height, straddling the trap', () => {
  const trap: TrapPreview = { counter: 'shield', x: GAME_W + 60, width: OBSTACLES.ARROW_W };
  const coins = patternFor(trap);

  assert.ok(
    coins.length >= PICKUPS.COIN_MIN_PER_PATTERN && coins.length <= PICKUPS.COIN_MAX_PER_PATTERN,
    'the usual short pattern, no more',
  );
  assert.ok(
    coins.every(c => Math.abs(above(c, FLOOR_Y) - PICKUPS.SHIELD_COIN_OFFSET) < 1e-6),
    'every coin is at the height the block is raised at',
  );

  const centre = (coins[0].x + coins[coins.length - 1].x) / 2;
  assert.ok(
    Math.abs(centre - (trap.x + trap.width / 2)) < 1e-6,
    'the line is centred on the wall it belongs to',
  );
  assert.ok(coins.every(c => c.x >= GAME_W), 'born off screen');
});

test('run-under coins lie on the floor beneath the bat', () => {
  const trap: TrapPreview = { counter: 'run_under', x: GAME_W + 60, width: 0 };
  const coins = patternFor(trap);

  assert.ok(coins.every(c => Math.abs(above(c, FLOOR_Y) - PICKUPS.GROUND_COIN_OFFSET) < 1e-6));
  assert.ok(
    Math.abs((coins[0].x + coins[coins.length - 1].x) / 2 - trap.x) < 1e-6,
    'centred under the bat he simply keeps running beneath',
  );
  assert.ok(coins.every(c => c.x >= GAME_W), 'born off screen');
});

test('the shield lane is reachable on foot at any screen height', () => {
  // The knight is sized FROM THE SCREEN, so a fixed lane has to be inside his
  // body band on a short phone as well as a tall one.
  for (const [w, h] of [[360, 480], [360, 568], [390, 640], [390, 844], [411, 926]]) {
    const layout = makeLayout(w, h);
    const floorY = layout.floorY();
    const coins = patternFor({ counter: 'shield', x: layout.gameW + 24, width: OBSTACLES.ARROW_W }, w, floorY);

    const knight = new Knight(layout.knightX(), floorY, h);
    const body = knight.getHitbox();
    for (const coin of coins) {
      const box = pickupHitbox(coin);
      // Only the HEIGHT is at stake here: where along the corridor the coin
      // sits is the trap's business, but it must be in reach of a knight who
      // simply keeps running, whatever screen he is on.
      assert.ok(
        box.y < body.y + body.h && box.y + box.h > body.y,
        `${w}x${h}: a standing knight misses a shield-lane coin (body ${JSON.stringify(body)}, coin ${JSON.stringify(box)})`,
      );
    }
  }
});

// ─── The clock itself ─────────────────────────────────────────────────────────

test('a due pattern waits for its trap, but never waits forever', () => {
  const spawner = new PickupSpawner();
  let offeredAt = -1;

  for (let t = 0; t < PICKUPS.SPAWN_INTERVAL_MIN + PICKUPS.TRAP_ALIGN_WAIT + 1; t += DT) {
    spawner.update(DT, GAME_W, FLOOR_Y, null); // no trap in this corridor at all
    if (spawner.pickups.length > 0) { offeredAt = t; break; }
  }

  assert.ok(offeredAt >= 0, 'a corridor without traps still pays out');
  assert.ok(
    offeredAt >= PICKUPS.SPAWN_INTERVAL_MIN,
    `offered at ${offeredAt.toFixed(2)}s — the interval still governs the clock`,
  );
  assert.ok(
    offeredAt <= PICKUPS.SPAWN_INTERVAL_MIN + PICKUPS.TRAP_ALIGN_WAIT + DT * 2,
    `offered at ${offeredAt.toFixed(2)}s — the wait for a trap is bounded by TRAP_ALIGN_WAIT`,
  );
});

test('with a trap waiting, the pattern is offered the moment the clock fires', () => {
  const spawner = new PickupSpawner();
  const trap: TrapPreview = { counter: 'shield', x: GAME_W + 40, width: OBSTACLES.ARROW_W };

  // One frame short of the interval: the clock must not have fired yet.
  for (let t = 0; t < PICKUPS.SPAWN_INTERVAL_MIN - DT; t += DT) {
    spawner.update(DT, GAME_W, FLOOR_Y, trap);
  }
  assert.equal(spawner.pickups.length, 0, 'nothing before the interval');

  spawner.update(DT, GAME_W, FLOOR_Y, trap);
  assert.ok(spawner.pickups.length > 0, 'offered at once — no wait when there is a trap to belong to');
});

// ─── The clock against the timeline ───────────────────────────────────────────

test('a due offer waits for the trap the timeline is about to roll', () => {
  const spawner = new PickupSpawner();

  // The clock fires while traps ARE coming, but none was rolled this frame:
  // the coins must not be poured out in the gap between two traps.
  for (let t = 0; t < PICKUPS.SPAWN_INTERVAL_MIN + 5; t += DT) {
    spawner.update(DT, GAME_W, FLOOR_Y, null, true);
  }
  assert.equal(spawner.pickups.length, 0, 'no coins between two traps while the timeline runs');

  // …and the frame the timeline rolls one, the pattern is laid in its lane.
  const trap: TrapPreview = { counter: 'shield', x: GAME_W + 120, width: OBSTACLES.ARROW_W };
  spawner.update(DT, GAME_W, FLOOR_Y, trap, true);

  assert.ok(spawner.pickups.length > 0, 'offered the moment its trap was born');
  assert.ok(
    spawner.pickups.every(c => Math.abs(above(c, FLOOR_Y) - PICKUPS.SHIELD_COIN_OFFSET) < 1e-6),
    'and it is the shield lane of that very trap',
  );
});

test('a pattern without a timeline to wait for is born past the right edge', () => {
  const coins = patternFor(null);

  assert.ok(coins.length > 0, 'a corridor with no timeline still pays out');
  assert.ok(
    coins.every(c => c.x >= GAME_W),
    `the pattern was born at x=${Math.min(...coins.map(c => c.x))}, inside the playfield`,
  );
});

// ─── The wiring: obstacles → preview → coins ──────────────────────────────────

test('the game lays its coins in the lane of the trap it just rolled', () => {
  const h = buildGame();
  h.game.handleAnyInput();

  let coins: Pickup[] = [];
  for (let frame = 0; frame < 1500 && coins.length === 0; frame++) {
    // Keep the sample run alive: the traps are cleared off the playfield, but
    // the timeline still ROLLS them every frame — and rolling is exactly what
    // the coin pattern has to be there for.
    h.game.spawner.obstacles.length = 0;
    step(h);
    coins = h.game.pickupSpawner.pickups.filter(p => p.type === 'coin');
  }

  assert.equal(h.game.state, 'playing', 'the sample run never ended');
  assert.ok(coins.length > 0, 'the pickup clock offered a pattern during the run');

  const floorY = h.layout.floorY();
  const sorted = [...coins].sort((a, b) => a.x - b.x);
  const centre = (sorted[0].x + sorted[sorted.length - 1].x) / 2;

  // The pattern is offered on the very frame its trap is rolled, and coins and
  // trap scroll together from then on — so it must still sit EXACTLY on one of
  // them, whatever kind of trap the timeline happened to send.
  let owner: TrapPreview | null = null;
  let bestGap = Infinity;
  for (const obs of h.game.spawner.obstacles) {
    const lane = trapPreview(obs, floorY);
    const gap = Math.abs(lane.x + lane.width / 2 - centre);
    if (gap < bestGap) {
      bestGap = gap;
      owner = lane;
    }
  }

  assert.ok(owner, 'the corridor has traps by the time a pattern is offered');
  assert.ok(
    bestGap < 1,
    `the pattern (centre ${centre}) sits ${bestGap}px off the trap it belongs to`,
  );
  assert.ok(
    sorted.every(c => c.x >= h.layout.gameW),
    'and it was born off screen, never in the middle of the corridor',
  );

  // The lane must be the one that CLEARS that trap: an arc over the spikes …
  if (owner.counter === 'jump') {
    assert.ok(sorted[0].x < owner.x, 'the arc starts before the spikes');
    assert.ok(sorted[sorted.length - 1].x > owner.x + owner.width, 'and lands beyond them');
    const peak = sorted[Math.floor(sorted.length / 2)];
    assert.ok(
      Math.abs(above(peak, floorY) - PICKUPS.ARC_PEAK_OFFSET) < 1e-6,
      'peaking at the jump apex, so one jump takes the whole arc',
    );
  } else {
    // … or the lane of the counter: shield height, or the floor beneath it.
    const lane = owner.counter === 'shield' ? PICKUPS.SHIELD_COIN_OFFSET : PICKUPS.GROUND_COIN_OFFSET;
    assert.ok(
      sorted.every(c => Math.abs(above(c, floorY) - lane) < 1e-6),
      `every coin sits in the ${owner.counter} lane, ${lane}px above the floor`,
    );
  }
});
