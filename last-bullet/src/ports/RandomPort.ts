/**
 * Source of randomness for the game world.
 *
 * The domain only ever asks for abstract values, never for `Math.random()`,
 * which keeps `GameWorld` fully deterministic when a seeded adapter is wired in
 * and lets a whole run be replayed headless in the test suite.
 */
export interface RandomPort {
  /** Uniform float in [0, 1). */
  pickFloat(): number;
  /** Uniform integer in [min, max], both inclusive. */
  pickInt(min: number, max: number): number;
}
