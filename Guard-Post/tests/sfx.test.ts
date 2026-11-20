import test from 'node:test';
import assert from 'node:assert/strict';

import { sfxForEvent } from '../src/app/sfx.ts';
import type { AudioPort, SfxName } from '../src/app/ports.ts';
import type { RoundEvent } from '../src/domain/types.ts';

/**
 * The event → sound map is plain app-layer data, so it runs in Node with no
 * AudioContext, no browser and no renderer. The audio adapter itself is deliberately
 * not imported here: this suite guards the contract, not the oscillators.
 */

const SOUNDS: readonly (readonly [RoundEvent, SfxName])[] = [
    [{ type: 'shot' }, 'shoot'],
    [{ type: 'hit' }, 'hit'],
    [{ type: 'kill' }, 'kill'],
    [{ type: 'leak', lives: 9 }, 'leak'],
    [{ type: 'waveIncoming', wave: 2 }, 'wave'],
    [{ type: 'waveStarted', wave: 2 }, 'wave'],
    [{ type: 'waveCleared', bonus: 21, score: 100 }, 'waveClear'],
    [{ type: 'levelCleared' }, 'levelClear'],
    [{ type: 'defeat', score: 500 }, 'defeat'],
    [{ type: 'ddaChanged', tier: 1, multiplier: 1.1, reason: 'clean' }, 'upgrade'],
    [{ type: 'ddaChanged', tier: 0, multiplier: 1, reason: 'leak' }, 'blocked'],
    [{ type: 'blocked', reason: 'gold' }, 'blocked'],
];

test('every audible event maps to exactly one sound', () => {
    for (const [event, expected] of SOUNDS) {
        assert.equal(sfxForEvent(event), expected, `event ${event.type} should sound like ${expected}`);
    }
});

test('an unrecognised event stays silent', () => {
    assert.equal(sfxForEvent({ type: 'unknown' } as unknown as RoundEvent), null);
});

test('the audio port stays tiny and headless', () => {
    const calls: string[] = [];
    const audio: AudioPort = {
        startMusic: () => calls.push('startMusic'),
        stopMusic: () => calls.push('stopMusic'),
        play: (name) => calls.push(name),
    };
    audio.startMusic();
    audio.play('build');
    audio.stopMusic();
    assert.deepEqual(calls, ['startMusic', 'build', 'stopMusic']);
});
