import type { RandomPort } from '../../ports/RandomPort.ts';

/**
 * Deterministic, seedable implementation of `RandomPort`.
 *
 * A full-period 32-bit LCG (Numerical Recipes constants), which is more than
 * good enough for spawn angles and card offers, and lets the test suite
 * replay a whole run exactly.
 */
export class RandomAdapter implements RandomPort {
  private state: number;

  constructor(seed: number = (Date.now() & 0x7fffffff) >>> 0) {
    this.state = (seed >>> 0) || 1;
  }

  private next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  pickFloat(): number {
    return this.next();
  }

  pickInt(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
