import type { RandomPort } from '../../ports/RandomPort.ts';
import type { Sign } from '../../core/types.ts';
import { SIGNS } from '../../core/RpsRules.ts';

/**
 * Deterministic, seedable implementation of `RandomPort`.
 *
 * A full-period 32-bit LCG (Numerical Recipes constants), which is more than
 * good enough for a game whose enemy is meant to be unpredictable, and lets
 * the test suite replay thousands of runs exactly.
 */
export class RandomAdapter implements RandomPort {
  private state: number;

  constructor(seed: number = (Date.now() & 0x7fffffff) >>> 0) {
    this.state = seed >>> 0;
  }

  private next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  pickSign(): Sign {
    return SIGNS[Math.floor(this.next() * SIGNS.length)];
  }

  pickFloat(): number {
    return this.next();
  }

  pickInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
