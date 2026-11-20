import type { RoundEvent } from '../domain/types.ts';
import type { SfxName } from './ports.ts';

/**
 * Domain events → sounds, as plain data.
 *
 * The audio adapter only knows names; this is where a round event becomes a sound. It
 * lives in the app layer so it can be tested without an AudioContext, a browser or any
 * of the renderer's objects. Events with no audible meaning stay silent.
 */
export function sfxForEvent(event: RoundEvent): SfxName | null {
    switch (event.type) {
        case 'shot':
            return 'shoot';
        case 'hit':
            return 'hit';
        case 'kill':
            return 'kill';
        case 'leak':
            return 'leak';
        case 'waveIncoming':
        case 'waveStarted':
            return 'wave';
        case 'waveCleared':
            return 'waveClear';
        case 'levelCleared':
            return 'levelClear';
        case 'defeat':
            return 'defeat';
        case 'ddaChanged':
            return event.reason === 'leak' ? 'blocked' : 'upgrade';
        case 'blocked':
            return 'blocked';
        default:
            return null;
    }
}
