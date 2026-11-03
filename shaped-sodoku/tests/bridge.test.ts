import test from 'node:test';
import assert from 'node:assert/strict';

import { createHostBridge } from '../src/bridge/hostBridge.ts';

/**
 * The host contract, checked against a stubbed `window.MpPostMessage`.
 *
 * The raw module is permissive — it will happily post `launch` twice. This suite is what
 * proves the adapter keeps the guarantees the repository rules require: `launch` once per
 * session, `startRound` every round, `endRound` once per round (re-armed by `startRound`),
 * `exit` at most once.
 */

interface RecordedCall {
    readonly channel: string;
    readonly payload: unknown;
}

const calls: RecordedCall[] = [];

(globalThis as { window?: unknown }).window = {
    MpPostMessage: (channel: string, payload: unknown): void => {
        calls.push({ channel, payload });
    },
};

function lastPayload(): unknown {
    return calls[calls.length - 1]?.payload;
}

test.beforeEach(() => {
    calls.length = 0;
});

test('every signal posts on the gameState channel with the documented payload', () => {
    const bridge = createHostBridge();

    bridge.launch();
    assert.deepEqual(lastPayload(), { type: 'launch' });

    bridge.startRound();
    assert.deepEqual(lastPayload(), { type: 'startRound' });

    bridge.endRound(true, 1234);
    assert.deepEqual(lastPayload(), { type: 'endRound', win: true, score: 1234 });

    bridge.exit(true, 1234);
    assert.deepEqual(lastPayload(), { type: 'exit', lastWin: true, lastScore: 1234 });

    for (const call of calls) assert.equal(call.channel, 'gameState', 'every payload uses one channel');
});

test('launch fires exactly once per session, however often Play is tapped', () => {
    const bridge = createHostBridge();

    bridge.launch();
    bridge.launch();
    bridge.launch();

    const launches = calls.filter((call) => (call.payload as { type: string }).type === 'launch');
    assert.equal(launches.length, 1, 'launch must never be sent twice');
});

test('startRound fires at every round start, including Retry and Next Level', () => {
    const bridge = createHostBridge();

    bridge.startRound();
    bridge.startRound();
    bridge.startRound();

    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => (call.payload as { type: string }).type === 'startRound'));
});

test('endRound fires once per round and is re-armed by the next startRound', () => {
    const bridge = createHostBridge();

    // Round one: an eager double-report must still reach the host only once.
    bridge.startRound();
    bridge.endRound(true, 500);
    bridge.endRound(true, 500);
    assert.equal(
        calls.filter((call) => (call.payload as { type: string }).type === 'endRound').length,
        1,
        'the first round reported exactly once',
    );

    // Round two (a Retry) must be able to report in its own right.
    bridge.startRound();
    bridge.endRound(false, 0);
    assert.equal(
        calls.filter((call) => (call.payload as { type: string }).type === 'endRound').length,
        2,
        'startRound re-armed endRound for the next round',
    );
});

test('exit fires at most once, even if tapped repeatedly', () => {
    const bridge = createHostBridge();

    bridge.exit(false, 0);
    bridge.exit(false, 0);

    assert.equal(calls.filter((call) => (call.payload as { type: string }).type === 'exit').length, 1);
});

test('an independent bridge per composition root gets independent guards', () => {
    const first = createHostBridge();
    const second = createHostBridge();

    first.launch();
    second.launch();

    assert.equal(calls.filter((call) => (call.payload as { type: string }).type === 'launch').length, 2);
});
