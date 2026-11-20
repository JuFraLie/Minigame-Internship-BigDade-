import test from 'node:test';
import assert from 'node:assert/strict';

import { resyncSequencer } from '../src/adapters/audio/ProceduralAudio.ts';

/**
 * The music scheduler must survive a busy JS thread — 2x gameplay runs twice as many
 * simulation steps per frame, which can delay the timer that feeds Web Audio. A late
 * callback must skip the notes it missed, never schedule them in the past, or Web Audio
 * fires them all at once and the music sounds broken.
 */

test('an on-time sequencer is left alone', () => {
    assert.deepEqual(resyncSequencer(1.5, 1.45, 3, 0.1, 16), { nextNoteAt: 1.5, step: 3 });
    assert.deepEqual(resyncSequencer(1.5, 1.5, 7, 0.1, 16), { nextNoteAt: 1.5, step: 7 });
});

test('a stalled sequencer skips whole steps and keeps the pattern phase', () => {
    const result = resyncSequencer(0.35, 0.8, 2, 0.1, 16);
    assert.ok(result.nextNoteAt >= 0.8, 'the next note must never be scheduled in the past');
    assert.ok(Math.abs(result.nextNoteAt - 0.85) < 1e-9);
    assert.equal(result.step, 7, 'five skipped steps carry the arpeggio forward');
});

test('a long stall still resumes on the next beat, not with a burst', () => {
    const result = resyncSequencer(0.25, 9, 0, 0.1, 16);
    assert.ok(result.nextNoteAt >= 9);
    assert.ok(Math.abs(result.nextNoteAt - 9.05) < 1e-9);
    assert.equal(result.step, 8);
});

test('the live adapter never schedules a note in the past after a stall', async () => {
    let audioTime = 0;
    const hooks: { tick: (() => void) | null } = { tick: null };
    let lastContext: FakeContext | null = null;

    class Param {
        readonly values: number[] = [];
        setValueAtTime(value: number): void {
            this.values.push(value);
        }
        exponentialRampToValueAtTime(value: number): void {
            this.values.push(value);
        }
    }
    class Node {
        connect(): this {
            return this;
        }
    }
    class Gain extends Node {
        readonly gain = new Param();
    }
    class Osc extends Node {
        readonly frequency = new Param();
        type: OscillatorType = 'square';
        readonly starts: number[] = [];
        start(at: number): void {
            this.starts.push(at);
        }
        stop(): void {}
    }
    class Source extends Node {
        readonly starts: number[] = [];
        start(at: number): void {
            this.starts.push(at);
        }
        stop(): void {}
    }
    class FakeContext {
        readonly destination = new Node();
        readonly sampleRate = 44100;
        state = 'running';
        readonly oscillators: Osc[] = [];
        readonly sources: Source[] = [];
        get currentTime(): number {
            return audioTime;
        }
        createGain(): Gain {
            return new Gain();
        }
        createOscillator(): Osc {
            const oscillator = new Osc();
            this.oscillators.push(oscillator);
            return oscillator;
        }
        createBufferSource(): Source {
            const source = new Source();
            this.sources.push(source);
            return source;
        }
        createBuffer(_channels: number, length: number) {
            return { getChannelData: () => new Float32Array(length) };
        }
        resume(): void {}
    }

    type FakeWindow = {
        AudioContext: new () => FakeContext;
        setInterval: (callback: () => void) => number;
        clearInterval: () => void;
    };
    const scope = globalThis as unknown as { window: FakeWindow };
    scope.window = {
        AudioContext: class extends FakeContext {
            constructor() {
                super();
                lastContext = this;
            }
        },
        setInterval: (callback) => {
            hooks.tick = callback;
            return 1;
        },
        clearInterval: () => {},
    };

    const { createProceduralAudio } = await import('../src/adapters/audio/ProceduralAudio.ts');
    const audio = createProceduralAudio();
    audio.startMusic();
    assert.ok(hooks.tick, 'startMusic must arm the scheduler');

    audioTime = 0.1;
    hooks.tick();
    const context = lastContext as unknown as FakeContext;
    const beforeOscillators = context.oscillators.length;
    const beforeSources = context.sources.length;

    // Simulate a 700 ms stall: the real cause of the glitch on a busy 2x frame.
    audioTime += 0.7;
    hooks.tick();

    const starts = [
        ...context.oscillators.slice(beforeOscillators).flatMap((oscillator) => oscillator.starts),
        ...context.sources.slice(beforeSources).flatMap((source) => source.starts),
    ];
    assert.ok(starts.length > 0, 'the sequencer must still make progress');
    assert.ok(starts.length <= 12, `a stall must not dump a burst of notes (got ${starts.length})`);
    assert.ok(starts.every((at) => at >= audioTime - 1e-9), 'no note may start in the past');

    audio.stopMusic();
});
