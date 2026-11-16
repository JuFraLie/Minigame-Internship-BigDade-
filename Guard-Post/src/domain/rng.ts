/**
 * Deterministic pseudo-randomness for level generation.
 *
 * The implementation lives with the map pipeline in `map/prng.ts`; this module keeps
 * the import path the wave generator and its tests already use.
 */

export { mulberry32, seedOf } from './map/prng.ts';
