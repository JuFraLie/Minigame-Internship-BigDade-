import test from 'node:test';
import assert from 'node:assert/strict';

import type { HostPort } from '../src/app/ports.ts';
import { ROUND_REPORTED_WIN, createSessionFlow } from '../src/app/sessionFlow.ts';
import { STARTING_LIVES } from '../src/domain/types.ts';

/**
 * The screen-flow state machine, and the bridge traffic it owns (AGENTS.md §2 and §4.2):
 * `launch` once after Play, `startRound` every round, `endRound` at the Result Panel,
 * `exit` at most once and only from there — with Pause offering resume and nothing else.
 */

interface RecordedCall {
    readonly name: string;
    readonly args: readonly unknown[];
}

function fakeHost(): { port: HostPort; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const port: HostPort = {
        launch(): void {
            calls.push({ name: 'launch', args: [] });
        },
        startRound(): void {
            calls.push({ name: 'startRound', args: [] });
        },
        endRound(win: boolean, score: number): void {
            calls.push({ name: 'endRound', args: [win, score] });
        },
        exit(win: boolean, score: number): void {
            calls.push({ name: 'exit', args: [win, score] });
        },
    };
    return { port, calls };
}

function names(calls: readonly RecordedCall[]): string[] {
    return calls.map((call) => call.name);
}

test('the Play Screen fires launch exactly once', () => {
    const { port, calls } = fakeHost();
    const flow = createSessionFlow(port);

    assert.equal(flow.state, 'play');
    assert.equal(flow.level, 1);

    flow.onPlay();
    assert.equal(flow.state, 'playing');
    flow.onPlay(); // a double tap must not send a second launch
    flow.onPlay();

    assert.deepEqual(names(calls), ['launch']);
});

test('every round announces startRound — first play, Retry and Next Level alike', () => {
    const { port, calls } = fakeHost();
    const flow = createSessionFlow(port);

    flow.onPlay();
    flow.beginRound(); // first play
    flow.endRound('victory', 500);
    flow.retry();
    flow.beginRound(); // Retry
    flow.endRound('defeat', 100);
    flow.nextLevel();
    flow.beginRound(); // Next Level

    assert.deepEqual(names(calls), [
        'launch',
        'startRound',
        'endRound',
        'startRound',
        'endRound',
        'startRound',
    ]);
    assert.equal(flow.level, 2);
});

test('endRound fires once per round at the Result Panel, win: true with the score', () => {
    const { port, calls } = fakeHost();
    const flow = createSessionFlow(port);
    assert.equal(ROUND_REPORTED_WIN, true, 'an endless game must report win: true (AGENTS.md §4.2)');

    flow.onPlay();
    flow.beginRound();
    flow.endRound('victory', 500);

    assert.equal(flow.state, 'result');
    assert.equal(flow.outcome, 'victory');
    assert.equal(flow.lastScore, 500);

    flow.endRound('victory', 999); // a second report for the same round is ignored
    assert.equal(flow.lastScore, 500);

    assert.deepEqual(names(calls), ['launch', 'startRound', 'endRound']);
    assert.deepEqual(calls[2].args, [true, 500]);
});

test('a defeat still reports win: true to the host, while the panel shows Defeat', () => {
    const { port, calls } = fakeHost();
    const flow = createSessionFlow(port);

    flow.onPlay();
    flow.beginRound();
    flow.endRound('defeat', 120);

    assert.equal(flow.outcome, 'defeat', 'the player sees the real outcome');
    assert.deepEqual(calls[2].args, [true, 120], 'the endless-game payload is win: true either way');
});

test('Pause only resumes: no restart, no exit, no host traffic', () => {
    const { port, calls } = fakeHost();
    const flow = createSessionFlow(port);

    flow.pause(); // before Play: nothing to pause
    assert.equal(flow.state, 'play');

    flow.onPlay();
    flow.beginRound();
    flow.pause();
    assert.equal(flow.state, 'paused');

    // The buttons a pause screen must not have, called anyway: all refused.
    flow.retry();
    flow.nextLevel();
    flow.exit();
    flow.pause();

    assert.equal(flow.state, 'paused');
    assert.equal(flow.level, 1);
    assert.deepEqual(names(calls), ['launch', 'startRound']);

    flow.resume();
    assert.equal(flow.state, 'playing');
    flow.resume(); // a second resume is a no-op, not a state flip
    assert.equal(flow.state, 'playing');

    flow.pause();
    assert.equal(flow.state, 'paused');
    flow.resume();
    assert.equal(flow.state, 'playing');
    assert.deepEqual(names(calls), ['launch', 'startRound'], 'pausing never talks to the host');
});

test('Exit signals the host exactly once, and only from the Result Panel', () => {
    const { port, calls } = fakeHost();
    const flow = createSessionFlow(port);

    flow.exit(); // on the Play Screen: refused
    assert.deepEqual(names(calls), []);

    flow.onPlay();
    flow.beginRound();
    flow.exit(); // mid-round: refused
    assert.deepEqual(names(calls), ['launch', 'startRound']);

    flow.endRound('defeat', 75);
    flow.exit();
    flow.exit(); // at most once
    flow.exit();

    assert.deepEqual(names(calls), ['launch', 'startRound', 'endRound', 'exit']);
    assert.deepEqual(calls[3].args, [true, 75], 'exit carries the last win and last score');
});

test('Retry and Next Level go straight back to gameplay, never through the Play Screen', () => {
    const { port } = fakeHost();
    const flow = createSessionFlow(port);

    flow.retry(); // no round has ended: refused
    assert.equal(flow.state, 'play');

    flow.onPlay();
    flow.beginRound();
    flow.endRound('defeat', 10);

    flow.retry();
    assert.equal(flow.state, 'playing', 'Retry lands directly in gameplay');
    assert.equal(flow.outcome, null);
    assert.equal(flow.level, 1, 'Retry replays the same level');

    flow.beginRound(); // every round announces itself, Retry included
    flow.endRound('victory', 200);
    flow.nextLevel();
    assert.equal(flow.state, 'playing');
    assert.equal(flow.outcome, null);
    assert.equal(flow.level, 2, 'Next Level advances the counter');
});

test('health and DDA carry through a run; only death restarts them', () => {
    const { port } = fakeHost();
    const flow = createSessionFlow(port);

    assert.equal(flow.lives, STARTING_LIVES);
    assert.equal(flow.ddaTier, 0);

    flow.onPlay();
    flow.beginRound();
    flow.endRound('victory', 1000, 6, 3);
    assert.equal(flow.lives, 6);
    assert.equal(flow.ddaTier, 3);

    flow.nextLevel();
    assert.equal(flow.lives, 6, 'a new level must not heal the player');
    assert.equal(flow.ddaTier, 3, 'DDA earned on clean play carries forward');
    flow.beginRound();
    flow.endRound('victory', 2000, 5, 5);

    flow.retry();
    assert.equal(flow.lives, 5, 'a victory retry also keeps the surviving health');
    assert.equal(flow.ddaTier, 5);

    flow.beginRound();
    flow.endRound('defeat', 3000, 0, 0);
    flow.retry();
    assert.equal(flow.lives, STARTING_LIVES, 'only death starts a fresh run');
    assert.equal(flow.ddaTier, 0);
});
