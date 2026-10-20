import { CAR_POINTS, CLEAR_BONUS_POINTS, COMBO_WINDOW_SECONDS, LIVES, LIFE_BONUS_POINTS, MAX_MULTIPLIER, NEAR_MISS_POINTS, SPEED_BONUS_MAX_POINTS } from './config.ts';

/**
 * Score, combo and fenders for one round.
 *
 * Deliberately dumb: it knows the numbers and the rules, nothing about cars, the ring or
 * the screen, so the arithmetic can be tested on its own.
 */
export class ScoreState {
    score = 0;
    lives = LIVES;
    /** Consecutive fast releases; 0 means the multiplier is back to x1. */
    combo = 0;
    maxCombo = 0;
    cleared = 0;
    crashes = 0;

    private lastReleaseAt = Number.NEGATIVE_INFINITY;

    /** Back to a fresh round: no score, all fenders standing, no combo in flight. */
    reset(): void {
        this.score = 0;
        this.lives = LIVES;
        this.combo = 0;
        this.maxCombo = 0;
        this.cleared = 0;
        this.crashes = 0;
        this.lastReleaseAt = Number.NEGATIVE_INFINITY;
    }

    /** x1 until the second fast release, then climbing to the cap. */
    get multiplier(): number {
        return Math.min(MAX_MULTIPLIER, Math.max(1, this.combo));
    }

    /**
     * A car joined the ring. Releases within the combo window chain; a slower one starts a
     * fresh chain at x1.
     *
     * @param at round time in seconds of the release.
     * @returns points this release earned.
     */
    registerRelease(at: number): number {
        if (this.combo > 0 && at - this.lastReleaseAt <= COMBO_WINDOW_SECONDS) this.combo += 1;
        else this.combo = 1;

        this.lastReleaseAt = at;
        // Remembered as the best MULTIPLIER of the round, so it can never outgrow the cap.
        this.maxCombo = Math.max(this.maxCombo, this.multiplier);
        this.cleared += 1;

        const points = CAR_POINTS * this.multiplier;
        this.score += points;
        return points;
    }

    /** Joined the ring with a circling car 1-2 cells away. Flat, and never broken by a crash. */
    registerNearMiss(): number {
        this.score += NEAR_MISS_POINTS;
        return NEAR_MISS_POINTS;
    }

    /** A crash: the fender count drops and the combo is gone. */
    registerCrash(): void {
        this.combo = 0;
        this.lives -= 1;
        this.crashes += 1;
    }

    /**
     * The lot is empty: flat clear bonus, a bonus per surviving fender, and a time bonus
     * that decays to nothing at twice the par time.
     *
     * @param elapsed seconds the round took.
     * @param parSeconds time the bonus is measured against.
     */
    registerClear(elapsed: number, parSeconds: number): number {
        const lifeBonus = LIFE_BONUS_POINTS * Math.max(0, this.lives);
        const decay = parSeconds > 0 ? 1 - elapsed / (parSeconds * 2) : 0;
        const speedBonus = Math.round(SPEED_BONUS_MAX_POINTS * Math.max(0, Math.min(1, decay)));
        const points = CLEAR_BONUS_POINTS + lifeBonus + speedBonus;
        this.score += points;
        return points;
    }
}
