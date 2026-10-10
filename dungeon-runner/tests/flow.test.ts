// tests/flow.test.ts — the mandatory game flow of AGENTS.md §2 and the bridge
// ordering of §4.2, driven headless through the controller's ports.

import assert from 'node:assert/strict';
import test from 'node:test';

import { PICKUPS, SCORING } from '../src/config/gameConfig.ts';
import { resultButtons } from '../src/core/uiLayout.ts';
import { buildGame, DT, FakeBridge, forceDeath, step, type Harness } from './helpers.ts';

const startTap = (h: Harness): void => h.game.handleAnyInput();
const count = (calls: string[], wanted: string): number =>
  calls.filter(call => call === wanted).length;

test('it opens on the Play Screen and never starts a run by itself', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  step(h, 120);

  assert.equal(h.game.state, 'start');
  assert.equal(h.game.score, 0);
  assert.deepEqual(bridge.calls, [], 'nothing is reported before the player presses Play');
});

test('any tap on the Play Screen starts gameplay, with launch exactly once', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  startTap(h);
  assert.equal(h.game.state, 'playing');
  assert.deepEqual(bridge.calls, ['launch', 'startRound']);

  // A stray tap while the run is live must not relaunch the session.
  startTap(h);
  step(h, 30);
  assert.equal(h.game.state, 'playing');
  assert.equal(count(bridge.calls, 'launch'), 1);
  assert.equal(count(bridge.calls, 'startRound'), 1);
});

test('the tap that confirmed Play is swallowed instead of becoming a jump', () => {
  const h = buildGame();

  startTap(h);
  h.input.press('jump');
  step(h, 1);
  assert.equal(h.game.knight.state, 'running', 'the confirming tap does not jump');

  step(h, 20); // well past RULES.START_INPUT_DELAY
  h.input.press('jump');
  step(h, 1);
  assert.equal(h.game.knight.state, 'jumping', 'a deliberate tap still jumps');
});

test('the score is live during the run and frozen on the Result Panel', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  startTap(h);
  step(h, 100);
  const live = h.game.score;
  assert.ok(live > 0, 'the HUD score climbs while playing');

  forceDeath(h);
  step(h, 1);
  assert.equal(h.game.state, 'dead');

  const final = h.game.score;
  assert.ok(final >= live);
  step(h, 60);
  assert.equal(h.game.score, final, 'the final score does not move once the panel is up');
  assert.equal(bridge.calls[bridge.calls.length - 1], `endRound:true:${Math.floor(final)}`);
  assert.equal(h.audio.calls.includes('death'), true);
});

test('the score is distance plus exactly COIN_POINTS per coin — nothing else', () => {
  const h = buildGame();
  startTap(h);

  // Ten seconds of running with the traps swept away, so the run never ends.
  const frames = 600;
  for (let i = 0; i < frames; i++) {
    h.game.spawner.obstacles.length = 0;
    step(h);
  }

  const distance = frames * DT * SCORING.POINTS_PER_SECOND;
  const expected = distance + h.game.coins * PICKUPS.COIN_POINTS;
  assert.ok(
    Math.abs(h.game.score - expected) < 1e-9,
    `score ${h.game.score} must be distance (${distance}) + ${h.game.coins} coins (${expected})`,
  );
});

test('endRound fires once per run, at the moment the panel appears', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  startTap(h);
  step(h, 50);
  forceDeath(h);
  step(h, 1);
  const reported = `endRound:true:${Math.floor(h.game.score)}`;

  step(h, 200);
  assert.equal(count(bridge.calls, reported), 1);
  assert.equal(
    bridge.calls.filter(call => call.startsWith('endRound')).length,
    1,
    'the panel reports the run only once',
  );
});

test('Retry goes straight back to gameplay, never through the Play Screen', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  startTap(h);
  step(h, 50);
  forceDeath(h);
  step(h, 1);
  assert.equal(h.game.state, 'dead');
  assert.ok(h.game.score > 0);

  const { restart } = resultButtons(h.layout.gameW, h.layout.gameH);
  h.pointer.tapAt(restart.x + restart.w / 2, restart.y + restart.h / 2);
  step(h, 1);

  assert.equal(h.game.state, 'playing', 'Retry resumes the run directly');
  assert.equal(h.game.score, 0, 'the new run starts from zero');
  assert.equal(count(bridge.calls, 'launch'), 1, 'launch stays at once per session');
  assert.equal(count(bridge.calls, 'startRound'), 2, 'every round reports startRound');
});

test('a tap mid-round can neither restart nor reset the run', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  startTap(h);
  step(h, 50);
  const scoreBefore = h.game.score;
  const callsBefore = bridge.calls.length;

  const { restart } = resultButtons(h.layout.gameW, h.layout.gameH);
  h.pointer.tapAt(restart.x + restart.w / 2, restart.y + restart.h / 2);
  step(h, 10);

  assert.equal(h.game.state, 'playing');
  assert.ok(h.game.score > scoreBefore, 'the score keeps climbing');
  assert.equal(bridge.calls.length, callsBefore, 'no round is restarted mid-run');
});

test('Exit exists only on the Result Panel and does nothing else', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);
  const { exit } = resultButtons(h.layout.gameW, h.layout.gameH);
  const centre = { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };

  startTap(h);
  step(h, 50);

  // Exit is drawn at the same coordinates during the run — tapping it does nothing.
  h.pointer.tapAt(centre.x, centre.y);
  step(h, 1);
  assert.equal(h.game.state, 'playing');
  assert.equal(bridge.calls.some(call => call.startsWith('exit')), false);

  forceDeath(h);
  step(h, 1);
  const finalScore = Math.floor(h.game.score);

  h.pointer.tapAt(centre.x, centre.y);
  step(h, 1);

  assert.equal(bridge.calls[bridge.calls.length - 1], `exit:true:${finalScore}`);
  assert.equal(bridge.calls[bridge.calls.length - 2], `endRound:true:${finalScore}`);
  assert.equal(h.game.state, 'dead', 'exit performs no navigation and no restart');
  assert.equal(Math.floor(h.game.score), finalScore);
  assert.equal(count(bridge.calls, 'startRound'), 1, 'exit starts no new round');
});

test('a tap outside the Result Panel buttons keeps the panel up', () => {
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  startTap(h);
  step(h, 50);
  forceDeath(h);
  step(h, 1);

  h.pointer.tapAt(10, h.layout.gameH - 10);
  step(h, 5);

  assert.equal(h.game.state, 'dead');
  assert.equal(count(bridge.calls, 'startRound'), 1, 'an empty tap does not restart');
});
