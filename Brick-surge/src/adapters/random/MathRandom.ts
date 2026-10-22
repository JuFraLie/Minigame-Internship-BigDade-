/** Production RNG backed by Math.random. */

import type { RandomPort } from '../../domain/ports.ts';

export class MathRandom implements RandomPort {
    next(): number {
        return Math.random();
    }
}
