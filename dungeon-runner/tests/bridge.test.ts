// tests/bridge.test.ts — AGENTS.md §4.2: the payloads that reach the host.
// `services/jsbridge.ts` must be the only file touching `window.MpPostMessage`;
// this suite pins down its channel, payload shapes and once-only guarantees.

import assert from 'node:assert/strict';
import test from 'node:test';

import { resultButtons } from '../src/core/uiLayout.ts';
import { createHostBridge } from '../src/services/hostBridge.ts';
import { waitForBridge } from '../src/services/jsbridge.ts';
import { buildGame, FakeBridge, forceDeath, step } from './helpers.ts';

interface Posted {
  channel: string;
  payload: { type: string; win?: boolean; score?: number; lastWin?: boolean; lastScore?: number };
}

const posted: Posted[] = [];

// The WebView injects `window.MpPostMessage`; stand in for the host here.
(globalThis as unknown as { window: unknown }).window = {
  MpPostMessage: (channel: string, payload: Posted['payload']) => {
    posted.push({ channel, payload });
  },
};

const of = (type: string): Posted[] => posted.filter(entry => entry.payload.type === type);

test('every payload is posted on the gameState channel with the typed shape', () => {
  posted.length = 0;
  const bridge = createHostBridge();

  bridge.launch();
  bridge.startRound();
  bridge.endRound(true, 42);
  bridge.exit(true, 42);

  assert.deepEqual(posted, [
    { channel: 'gameState', payload: { type: 'launch' } },
    { channel: 'gameState', payload: { type: 'startRound' } },
    { channel: 'gameState', payload: { type: 'endRound', win: true, score: 42 } },
    { channel: 'gameState', payload: { type: 'exit', lastWin: true, lastScore: 42 } },
  ]);
});

test('launch, endRound and exit are sent at most once per session', () => {
  posted.length = 0;
  const bridge = createHostBridge();

  bridge.launch();
  bridge.launch();
  bridge.startRound();
  bridge.endRound(true, 1);
  bridge.endRound(true, 1);
  bridge.exit(true, 1);
  bridge.exit(true, 1);

  assert.equal(of('launch').length, 1);
  assert.equal(of('endRound').length, 1);
  assert.equal(of('exit').length, 1);
  assert.equal(of('startRound').length, 1);
});

test('starting a new round re-arms endRound', () => {
  posted.length = 0;
  const bridge = createHostBridge();

  bridge.startRound();
  bridge.endRound(true, 7);
  bridge.startRound();
  bridge.endRound(true, 9);

  assert.deepEqual(
    of('endRound').map(entry => entry.payload),
    [
      { type: 'endRound', win: true, score: 7 },
      { type: 'endRound', win: true, score: 9 },
    ],
  );
});

test('an endless run reports win: true — to the host and through the controller', () => {
  posted.length = 0;
  const bridge = new FakeBridge();
  const h = buildGame(bridge);

  h.game.handleAnyInput(); // Play
  step(h, 50);
  forceDeath(h);
  step(h, 1);

  const endRound = bridge.calls.find(call => call.startsWith('endRound'));
  assert.equal(endRound, `endRound:true:${Math.floor(h.game.score)}`);
});

test('a double tap on Exit still reaches the host exactly once', () => {
  posted.length = 0;
  const h = buildGame(createHostBridge());

  h.game.handleAnyInput();
  step(h, 50);
  forceDeath(h);
  step(h, 1);

  const { exit } = resultButtons(h.layout.gameW, h.layout.gameH);
  for (let i = 0; i < 5; i++) {
    h.pointer.tapAt(exit.x + exit.w / 2, exit.y + exit.h / 2);
    step(h, 1);
  }

  assert.equal(of('exit').length, 1, 'AGENTS.md §4.2: exit at most once');
  assert.equal(of('endRound').length, 1);
  assert.equal(of('launch').length, 1);
  assert.equal(of('startRound').length, 1);
  assert.equal(h.game.state, 'dead', 'exit itself changes nothing else');
});

test('the game waits for the bridge before it may start', async () => {
  assert.equal(await waitForBridge(), true, 'development mode may start without a host');
});
