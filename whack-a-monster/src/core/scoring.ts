import { COMBO_STEP, COMBO_STEP_BONUS, MAX_COMBO_BONUS, MAX_LIVES } from './config.ts';
import type { DefeatOutcome, EscapeOutcome } from './types.ts';

/**
 * Score, combo and lives for one round. Pure bookkeeping: no rendering, no timers, no I/O.
 */
export class ScoreState {
    readonly maxLives = MAX_LIVES;

    score = 0;
    lives = MAX_LIVES;
    combo = 0;
    maxCombo = 0;
    defeated = 0;

    reset(): void {
        this.score = 0;
        this.lives = this.maxLives;
        this.combo = 0;
        this.maxCombo = 0;
        this.defeated = 0;
    }

    /** Current combo multiplier: 1.0 at combo 0, +0.5 every `COMBO_STEP` hits, capped. */
    multiplier(): number {
        return 1 + Math.min(MAX_COMBO_BONUS, Math.floor(this.combo / COMBO_STEP) * COMBO_STEP_BONUS);
    }

    registerDefeat(basePoints: number): DefeatOutcome {
        this.defeated += 1;
        this.combo += 1;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        const multiplier = this.multiplier();
        const earned = Math.round(basePoints * multiplier);
        this.score += earned;
        return { earned, multiplier };
    }

    registerEscape(): EscapeOutcome {
        this.combo = 0;
        this.lives = Math.max(0, this.lives - 1);
        return { lives: this.lives, gameOver: this.lives <= 0 };
    }
}
