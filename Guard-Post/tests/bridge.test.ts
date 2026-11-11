import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The host bridge adapter, against a fake `window.MpPostMessage`.
 *
 * The page must not load game code before the bridge exists, so the adapter is imported
 * dynamically *after* the fake host is installed — the same order the real boot uses.
 * Payload shapes and the `'gameState'` channel come straight from AGENTS.md §4.2.
 */

interface Recorded {
    readonly channel: string;
    readonly payload: unknown;
}

const recorded: Recorded[] = [];

type FakeWindow = { MpPostMessage?: (channel: string, payload: unknown) => void };
const hostWindow = globalThis as unknown as { window: FakeWindow };

hostWindow.window = {
    MpPostMessage: (channel: string, payload: unknown): void => {
        recorded.push({ channel, payload });
    },
};

const { createHostBridge } = await import('../src/adapters/hostBridge.ts');

test('every signal goes out on the gameState channel with the documented payload', () => {
    const host = createHostBridge();

    host.launch();
    host.startRound();
    host.endRound(true, 1234);
    host.exit(true, 1234);

    assert.deepEqual(recorded, [
        { channel: 'gameState', payload: { type: 'launch' } },
        { channel: 'gameState', payload: { type: 'startRound' } },
        { channel: 'gameState', payload: { type: 'endRound', win: true, score: 1234 } },
        { channel: 'gameState', payload: { type: 'exit', lastWin: true, lastScore: 1234 } },
    ]);
});

test('a missing bridge drops every signal instead of throwing', () => {
    hostWindow.window = {}; // the host never showed up
    const host = createHostBridge();

    assert.doesNotThrow(() => {
        host.launch();
        host.startRound();
        host.endRound(false, 0);
        host.exit(false, 0);
    });
    assert.equal(recorded.length, 4, 'nothing was sent without a host');
});
