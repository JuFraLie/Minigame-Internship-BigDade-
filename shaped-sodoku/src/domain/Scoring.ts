/**
 * Scoring bookkeeping for one round.
 *
 * Deliberately has no knowledge of the board: it is handed deltas and returns what was
 * gained or lost, so the rules above it stay trivially testable.
 */

export interface ScoringConfig {
    /** Paid for each correct placement, before the streak multiplier. */
    readonly correctPlacement: number;
    /** Applied on a wrong placement. The score never drops below zero. */
    readonly wrongPlacement: number;
    /** Paid once per row, column or box completed by a single placement. */
    readonly lineCompletion: number;
    /** Paid for each second left under the par time when the board is finished. */
    readonly timeBonusPerSecond: number;
    /** The streak multiplier tops out here (×3). */
    readonly maxStreak: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
    correctPlacement: 100,
    wrongPlacement: -50,
    lineCompletion: 150,
    timeBonusPerSecond: 5,
    maxStreak: 3,
};

/** The outcome of one correct placement. */
export interface CorrectResult {
    readonly gained: number;
    /** The multiplier this placement was actually paid at. */
    readonly multiplier: number;
}

/** Running score and streak for a single round. */
export class ScoreLedger {
    #score = 0;
    #streak = 0;

    readonly #config: ScoringConfig;

    constructor(config: ScoringConfig = DEFAULT_SCORING) {
        this.#config = config;
    }

    get score(): number {
        return this.#score;
    }

    /** Consecutive correct placements since the last mistake. */
    get streak(): number {
        return this.#streak;
    }

    /** The multiplier the next correct placement will be paid at: ×1, ×2 or ×3. */
    get multiplier(): number {
        return Math.min(Math.max(this.#streak, 1), this.#config.maxStreak);
    }

    /** Pays a correct placement at the current multiplier and advances the streak. */
    recordCorrect(): CorrectResult {
        this.#streak += 1;
        const multiplier = this.multiplier;
        const gained = this.#config.correctPlacement * multiplier;
        this.#score += gained;
        return { gained, multiplier };
    }

    /**
     * Breaks the streak and applies the penalty.
     * The returned value is the delta actually applied to the score.
     */
    recordWrong(): number {
        this.#streak = 0;
        const before = this.#score;
        this.#score = Math.max(0, before + this.#config.wrongPlacement);
        return this.#score - before;
    }

    /** Pays the completion bonus once per row, column or box finished by one placement. */
    recordLineBonus(count: number): number {
        const bonus = Math.max(0, Math.floor(count)) * this.#config.lineCompletion;
        this.#score += bonus;
        return bonus;
    }

    /** Pays the win bonus for finishing `secondsLeft` under the par time. */
    recordTimeBonus(secondsLeft: number): number {
        const bonus = Math.max(0, Math.floor(secondsLeft)) * this.#config.timeBonusPerSecond;
        this.#score += bonus;
        return bonus;
    }
}

/** Grouped thousands, without locale formatting, so a score always reads the same way. */
export function formatScore(value: number): string {
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
