/**
 * The gameplay speed toggle is presentation state, not a rule of the round: the
 * simulation always steps at the same fixed rate, it just receives more wall-clock time
 * per frame when the player asks for a boost.
 */
export type GameSpeed = 1 | 2;

/** Flips between normal and boosted speed. */
export function nextSpeed(current: GameSpeed): GameSpeed {
    return current === 1 ? 2 : 1;
}

/** Wall-clock milliseconds to feed into the fixed-step accumulator for one frame. */
export function scaledDelta(deltaMs: number, speed: GameSpeed): number {
    return deltaMs * speed;
}
