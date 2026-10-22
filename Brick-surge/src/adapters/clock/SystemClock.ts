/** Production clock backed by performance.now (falls back to Date.now). */

import type { ClockPort } from '../../domain/ports.ts';

export class SystemClock implements ClockPort {
    now(): number {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
}
