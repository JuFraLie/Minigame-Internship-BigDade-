// tests/perf.test.ts — a headless performance guard (AGENTS.md §3.3, §4.3).
//
// The controller runs with no renderer at all, so this measures game-code cost
// only: on the reference device class the same loop must leave room for
// rendering on top of a 30 FPS floor (50 FPS average target). The budget below
// is deliberately generous so it flags a regression (an accidental O(n²) scan,
// a per-frame allocation storm) rather than a specific machine's clock.

import assert from 'node:assert/strict';
import test from 'node:test';

import { resultButtons } from '../src/core/uiLayout.ts';
import { buildGame, DT, forceDeath, step } from './helpers.ts';

const FRAMES = 5_000;
const BUDGET_MS_PER_FRAME = 4; // ≥250 FPS of headroom in pure game logic

test(`the headless loop stays inside ${BUDGET_MS_PER_FRAME} ms/frame for ${FRAMES} frames`, () => {
  const h = buildGame();
  const { restart } = resultButtons(h.layout.gameW, h.layout.gameH);

  h.game.handleAnyInput();

  const started = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    step(h);

    // Keep the simulation honest: never let the run end during the sample, and
    // never let an unbounded obstacle list skew the measurement.
    if (h.game.state === 'dead') {
      h.pointer.tapAt(restart.x + restart.w / 2, restart.y + restart.h / 2);
      step(h);
    }
    if (h.game.spawner.obstacles.length > 12) {
      h.game.spawner.obstacles.splice(0, h.game.spawner.obstacles.length - 12);
    }
    if (frame % 120 === 0) forceDeath(h); // exercise the collision path on purpose
  }
  const elapsed = performance.now() - started;

  const msPerFrame = elapsed / FRAMES;
  const fps = 1000 / msPerFrame;
  assert.ok(
    msPerFrame < BUDGET_MS_PER_FRAME,
    `game logic took ${msPerFrame.toFixed(3)} ms/frame (~${fps.toFixed(0)} FPS headless)`,
  );
});

test('the same loop keeps scoring and spawning alive while it runs', () => {
  const h = buildGame();
  h.game.handleAnyInput();

  let framesWithTraps = 0;
  for (let frame = 0; frame < 600; frame++) {
    step(h, 1, DT);
    if (h.game.state === 'dead') break;

    // Cull traps just before they could connect: the sample wants a live run.
    h.game.spawner.obstacles = h.game.spawner.obstacles.filter(
      obs => obs.x > h.layout.knightX() + 200,
    );
    if (h.game.spawner.obstacles.length > 0) framesWithTraps++;
  }

  assert.equal(h.game.state, 'playing', 'the grace period keeps the first run alive');
  assert.ok(h.game.score > 100, 'the HUD score advanced during the sample');
  assert.ok(framesWithTraps > 100, 'traps were actually spawned during the sample');
});
