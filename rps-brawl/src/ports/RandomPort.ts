import type { Sign } from '../core/types.ts';

/**
 * Source of randomness for the game world.
 *
 * The domain only ever asks for abstract values, never for `Math.random()`,
 * which keeps `GameCore` fully deterministic when a seeded adapter is wired in
 * and lets whole runs be simulated headless.
 */
export interface RandomPort {
  /** One of ROCK / PAPER / SCISSORS, uniformly at random. */
  pickSign(): Sign;
  /** Uniform float in [0, 1). */
  pickFloat(): number;
  /** Uniform integer in [min, max], both inclusive. */
  pickInt(min: number, max: number): number;
}
