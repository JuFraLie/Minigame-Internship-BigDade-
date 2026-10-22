/** Bridge adapter with a fake port: launch once, exit at most once. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { MpBridge } from '../src/adapters/bridge/MpBridge.ts';
import type { GameSignalsPort } from '../src/domain/ports.ts';

/**
 * MpBridge calls the jsbridge functions, which post through window.MpPostMessage.
 * We stub that global so the test observes the actual payloads.
 */
interface Recorded {
    channel: string;
    payload: { type: string; win?: boolean; score?: number; lastWin?: boolean; lastScore?: number };
}

const installFakeWindow = (): Recorded[] => {
    const sent: Recorded[] = [];
    (globalThis as Record<string, unknown>).window = {
        MpPostMessage: (channel: string, payload: Recorded['payload']) => {
            sent.push({ channel, payload });
        },
    };
    return sent;
};

describe('MpBridge (GameSignalsPort)', () => {
    it('launch fires exactly once even when pressed repeatedly', () => {
        const sent = installFakeWindow();
        const bridge: GameSignalsPort = new MpBridge();
        bridge.signalLaunch();
        bridge.signalLaunch();
        bridge.signalLaunch();
        assert.equal(sent.filter((s) => s.payload.type === 'launch').length, 1);
    });

    it('startRound fires on every round start', () => {
        const sent = installFakeWindow();
        const bridge = new MpBridge();
        bridge.signalStartRound();
        bridge.signalStartRound();
        assert.equal(sent.filter((s) => s.payload.type === 'startRound').length, 2);
    });

    it('endRound carries win and score', () => {
        const sent = installFakeWindow();
        const bridge = new MpBridge();
        bridge.signalEndRound(true, 1230);
        const end = sent.find((s) => s.payload.type === 'endRound');
        assert.ok(end);
        assert.equal(end.payload.win, true);
        assert.equal(end.payload.score, 1230);
    });

    it('exit fires at most once and carries the last result', () => {
        const sent = installFakeWindow();
        const bridge = new MpBridge();
        bridge.signalEndRound(false, 420);
        bridge.signalExit(false, 420);
        bridge.signalExit(false, 420);
        const exits = sent.filter((s) => s.payload.type === 'exit');
        assert.equal(exits.length, 1);
        assert.equal(exits[0].payload.lastWin, false);
        assert.equal(exits[0].payload.lastScore, 420);
    });

    it('every payload goes to the gameState channel', () => {
        const sent = installFakeWindow();
        const bridge = new MpBridge();
        bridge.signalLaunch();
        bridge.signalStartRound();
        bridge.signalEndRound(true, 1);
        bridge.signalExit(true, 1);
        assert.ok(sent.every((s) => s.channel === 'gameState'));
    });
});
