import assert from 'node:assert/strict';
import test from 'node:test';

import { createHostBridge } from '../src/platform/hostBridge.ts';
import { IS_DEVELOPMENT_MODE, waitForBridge } from '../src/jsbridge.ts';

interface Recorded {
    channel: string;
    payload: unknown;
}

const calls: Recorded[] = [];

/**
 * `jsbridge.ts` is the only module allowed to touch `window.MpPostMessage`, so the stub
 * lives at the global scope and records exactly what reaches the host.
 */
(globalThis as { window?: unknown }).window = {
    MpPostMessage: (channel: string, payload: unknown): void => {
        calls.push({ channel, payload });
    },
};

const payloads = (type: string): unknown[] =>
    calls.filter((call) => call.channel === 'gameState' && (call.payload as { type: string }).type === type)
        .map((call) => call.payload);

test('every signal goes out on the gameState channel', () => {
    calls.length = 0;
    const bridge = createHostBridge();

    bridge.launch();
    bridge.startRound();
    bridge.endRound(true, 120);
    bridge.exit(true, 120);

    assert.ok(calls.length > 0, 'something reached the host');
    assert.ok(calls.every((call) => call.channel === 'gameState'), 'one channel only');
});

test('launch fires exactly once, no matter how often Play is pressed', () => {
    calls.length = 0;
    const bridge = createHostBridge();

    bridge.launch();
    bridge.launch();
    bridge.launch();

    assert.deepEqual(payloads('launch'), [{ type: 'launch' }]);
});

test('startRound fires on every round start, retries included', () => {
    calls.length = 0;
    const bridge = createHostBridge();

    bridge.startRound();
    bridge.startRound();
    bridge.startRound();

    assert.deepEqual(payloads('startRound'), [
        { type: 'startRound' },
        { type: 'startRound' },
        { type: 'startRound' },
    ]);
});

test('endRound reports win and score, at most once per round', () => {
    calls.length = 0;
    const bridge = createHostBridge();

    bridge.endRound(true, 250);
    bridge.endRound(true, 250);

    assert.deepEqual(payloads('endRound'), [{ type: 'endRound', win: true, score: 250 }]);

    // A Retry opens a new round, which may report again.
    bridge.startRound();
    bridge.endRound(true, 90);
    assert.equal(payloads('endRound').length, 2);
});

test('exit reports the last round and fires exactly once', () => {
    calls.length = 0;
    const bridge = createHostBridge();

    bridge.exit(true, 400);
    bridge.exit(true, 400);

    assert.deepEqual(payloads('exit'), [{ type: 'exit', lastWin: true, lastScore: 400 }]);
});

test('development mode resolves immediately so the game runs in a browser', async () => {
    assert.equal(IS_DEVELOPMENT_MODE, true, 'flip to false before release');
    assert.equal(await waitForBridge(), true);
});
