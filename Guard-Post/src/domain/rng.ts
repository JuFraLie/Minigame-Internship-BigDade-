/**
 * Deterministic pseudo-randomness for level generation.
 *
 * Every level draws from a seed derived from its number, so the same level always
 * produces the same layout and the same wave compositions — reproducible in a unit
 * test and stable for the player — while different levels differ completely.
 */

/** A mulberry32 generator: tiny, fast and good enough for content generation. */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Combines a level with a salt (attempt, wave, ...) into one seed. */
export function seedOf(level: number, salt: number): number {
    let hash = (Math.imul(level, 374761393) + Math.imul(salt, 668265263)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
    return (hash ^ (hash >>> 16)) >>> 0;
}
