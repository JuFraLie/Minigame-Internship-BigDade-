/**
 * Deterministic pseudo-randomness for map generation.
 *
 * A mulberry32 generator is tiny, fast and good enough for content generation, and
 * every seed is derived from inputs (base seed, attempt number, level) so a map is
 * reproducible from its parameters alone — no global state, no clock, no `Math.random`.
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

/** Combines two numbers (level, salt, attempt, ...) into one seed. */
export function seedOf(a: number, b: number): number {
    let hash = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
    return (hash ^ (hash >>> 16)) >>> 0;
}

/** The seed for one generation attempt: attempt 0 is the first try, 1 the retry, ... */
export function attemptSeed(base: number, attempt: number): number {
    return seedOf(base, attempt);
}
