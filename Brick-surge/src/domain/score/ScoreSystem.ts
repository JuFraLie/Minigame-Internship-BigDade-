/** Score and combo: points per brick, combo multiplier, bonuses. */

import { COMBO_MAX, POWERUP_POINTS, WAVE_BONUS_PER_BALL } from '../config.ts';

export class ScoreSystem {
    private total = 0;
    /** Consecutive brick hits without touching the paddle; the multiplier is min(combo, COMBO_MAX). */
    private combo = 0;

    get score(): number { return this.total; }
    get comboMultiplier(): number { return Math.min(Math.max(this.combo, 1), COMBO_MAX); }

    reset(): void {
        this.total = 0;
        this.combo = 0;
    }

    /** A brick took damage — the combo chain grows with every hit, up to x5. */
    onBrickHit(): void {
        this.combo++;
    }

    /** A brick was destroyed — award points times the current combo multiplier. */
    addBrick(points: number): number {
        const awarded = points * this.comboMultiplier;
        this.total += awarded;
        return awarded;
    }

    /** The ball touched the paddle — the combo chain breaks. */
    breakCombo(): void {
        this.combo = 0;
    }

    /** A power-up was collected. */
    addPowerUp(): void {
        this.total += POWERUP_POINTS;
    }

    /** Wave clear bonus: 100 per ball still in the player's possession. Returns the bonus added. */
    addWaveBonus(balls: number): number {
        const bonus = WAVE_BONUS_PER_BALL * Math.max(0, balls);
        this.total += bonus;
        return bonus;
    }
}
