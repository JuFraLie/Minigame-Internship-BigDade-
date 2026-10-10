// tests/boss.test.ts — the chaser is decoration: it must stay BEHIND the
// knight, keep its gap inside the tuned bounds, and never freeze into a
// sticker. It feeds no collisions, so nothing here can hurt the player.

import assert from 'node:assert/strict';
import test from 'node:test';

import { BOSS } from '../src/config/gameConfig.ts';
import { resultButtons } from '../src/core/uiLayout.ts';
import { Boss, type ChaseContext } from '../src/game/boss.ts';
import { Knight } from '../src/game/knight.ts';
import { buildGame, DT, forceDeath, makeLayout, playUntilDead, step } from './helpers.ts';

/** The knight's visible body left edge, measured the same way the game does. */
const HEEL = (() => {
  const layout = makeLayout();
  return new Knight(layout.knightX(), layout.floorY(), layout.gameH).heelX;
})();

const ctx = (over: Partial<ChaseContext> = {}): ChaseContext => ({
  heelX: HEEL,
  worldSpeed: 400,
  progress: 0.5,
  caught: false,
  ...over,
});

/** Simulate `seconds` of frames and return every gap value produced. */
function run(boss: Boss, seconds: number, over: Partial<ChaseContext> = {}): number[] {
  const gaps: number[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    boss.update(DT, ctx(over));
    gaps.push(boss.gap);
  }
  return gaps;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

test('he always stays behind the knight, inside the tuned gap bounds', () => {
  for (const progress of [0, 0.35, 0.7, 1]) {
    const boss = new Boss(549, HEEL);
    for (const gap of run(boss, 60, { progress })) {
      assert.ok(gap >= BOSS.GAP_NEAR - 1e-9, `too close at progress ${progress}: ${gap}`);
      assert.ok(gap <= BOSS.GAP_FAR + 1e-9, `too far at progress ${progress}: ${gap}`);
      // rightEdge = heel - gap → he can never overtake the knight's body.
      assert.ok(boss.rightEdge <= HEEL - BOSS.GAP_NEAR + 1e-9, `overtook the knight: ${gap}`);
    }
  }
});

test('he bobs back and forth instead of hanging static', () => {
  const boss = new Boss(549, HEEL);
  const gaps = run(boss, 30, { progress: 0.5 });
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  assert.ok(max - min > 20, `no visible chase movement: min ${min}, max ${max}`);
});

test('he closes in as the run speeds up', () => {
  const slowGap = mean(run(new Boss(549, HEEL), 20, { progress: 0, worldSpeed: 220 }));
  const fastGap = mean(run(new Boss(549, HEEL), 20, { progress: 1, worldSpeed: 750 }));
  assert.ok(fastGap < slowGap - 10, `no escalation: slow ${slowGap}, fast ${fastGap}`);
});

test('a milestone lunge pulls him right up to the knight', () => {
  const boss = new Boss(549, HEEL);
  run(boss, 5, { progress: 0 });
  boss.lunge();
  const gaps = run(boss, BOSS.LUNGE_DURATION + 1, { progress: 0 });
  assert.ok(Math.min(...gaps) <= BOSS.GAP_NEAR + 5, `no lunge: min ${Math.min(...gaps)}`);
});

test('when the run ends he creeps up to the fallen knight and stops', () => {
  const boss = new Boss(549, HEEL);
  run(boss, 5, { progress: 0 });
  const gaps = run(boss, 5, { caught: true, worldSpeed: 0, progress: 0 });
  const last = gaps[gaps.length - 1];
  assert.ok(last <= BOSS.GAP_NEAR + 1, `never caught up: ${last}`);

  // …and once he is there, the walk cycle freezes with the world.
  const settled = boss.frame;
  run(boss, 2, { caught: true, worldSpeed: 0, progress: 0 });
  assert.equal(boss.frame, settled, 'keeps walking on the spot after catching up');
});

test('the walk cycle follows the world speed and stays inside the sheet', () => {
  const boss = new Boss(549, HEEL);
  const seen = new Set<number>([boss.frame]);
  for (let i = 0; i < 125; i++) {
    boss.update(DT, ctx({ worldSpeed: 500 }));
    seen.add(boss.frame);
  }
  assert.ok(seen.size > 1, 'the walk cycle never advanced');
  for (const frame of seen) {
    assert.ok(frame >= 0 && frame < BOSS.FRAMES, `bad frame: ${frame}`);
  }
});

test('a fresh run starts with him far behind — and already behind the knight', () => {
  const boss = new Boss(549, HEEL);
  assert.equal(boss.gap, BOSS.GAP_FAR);
  assert.ok(boss.rightEdge <= HEEL, 'in front of the knight before the very first update');
});

test('degenerate inputs never produce NaN or an escaped position', () => {
  const boss = new Boss(549, HEEL);
  for (const dt of [0, -1, 10]) {
    for (const progress of [-5, 0.5, 99]) {
      boss.update(dt, ctx({ progress, caught: progress === 99 }));
      assert.ok(Number.isFinite(boss.gap) && Number.isFinite(boss.x), `dt ${dt}`);
      assert.ok(boss.gap >= BOSS.GAP_NEAR - 1 && boss.gap <= BOSS.GAP_FAR + 1, 'escaped gap');
    }
  }
});

test('he creeps up after the Result Panel, and a restart sends him back', () => {
  const h = buildGame();
  h.game.handleAnyInput(); // Play Screen → run starts
  step(h, 180); // ~3 s of running, inside the spawn grace period
  assert.equal(h.game.state, 'playing');

  forceDeath(h);
  playUntilDead(h);
  const caughtGap = h.game.boss.gap;
  step(h, 240); // the panel is up; he closes in
  assert.ok(h.game.boss.gap < caughtGap, `never crept up: ${caughtGap} → ${h.game.boss.gap}`);

  // Retry from the Result Panel → a fresh chaser starts far behind again.
  const { restart } = resultButtons(h.layout.gameW, h.layout.gameH);
  h.pointer.tapAt(restart.x + restart.w / 2, restart.y + restart.h / 2);
  step(h, 1);
  assert.equal(h.game.state, 'playing');
  assert.equal(h.game.boss.gap, BOSS.GAP_FAR);
});
