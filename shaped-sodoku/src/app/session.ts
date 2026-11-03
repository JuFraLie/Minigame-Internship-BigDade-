import type { SessionPort } from '../domain/ports.ts';

/**
 * The state that outlives a single scene: which level is being played, the seed that
 * produced its puzzle, and the last reported result.
 *
 * Everything here is session-scoped and deliberately volatile — the rules forbid
 * persisting progress, so a fresh launch always starts at level 1 with a fresh seed.
 */
export function createSession(startSeed: number): SessionPort {
    let level = 1;
    let puzzleSeed = startSeed >>> 0;
    // A second stream, so advancing a level draws a seed that could not collide with the
    // session's starting one by accident of arithmetic.
    let stream = (startSeed ^ 0x9e3779b9) >>> 0;
    let lastScore = 0;
    let lastWin = false;

    const nextSeed = (): number => {
        stream = (stream + 0x6d2b79f5) >>> 0;
        let t = stream;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    };

    return {
        get level(): number {
            return level;
        },
        get puzzleSeed(): number {
            return puzzleSeed;
        },
        get lastScore(): number {
            return lastScore;
        },
        get lastWin(): boolean {
            return lastWin;
        },
        recordResult(win: boolean, score: number): void {
            lastWin = win;
            lastScore = score;
        },
        advanceLevel(): void {
            level += 1;
            puzzleSeed = nextSeed();
        },
    };
}

/** A fresh seed for a fresh session. Never persisted, so every launch is a new run. */
export function sessionSeed(): number {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
