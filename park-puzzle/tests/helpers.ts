/**
 * Deterministic randomness for the tests.
 *
 * The generator takes its randomness through a port, so a test can pin the sequence and
 * get the same level every run — a flaky solvability test would be worthless.
 */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A bridge port that records every signal, so ordering can be asserted. */
export function fakeBridge() {
    const calls: { type: string; win?: boolean; score?: number }[] = [];

    return {
        calls,
        launch: () => calls.push({ type: 'launch' }),
        startRound: () => calls.push({ type: 'startRound' }),
        endRound: (win: boolean, score: number) => calls.push({ type: 'endRound', win, score }),
        exit: (win: boolean, score: number) => calls.push({ type: 'exit', win, score }),
    };
}
