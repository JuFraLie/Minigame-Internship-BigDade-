// scoring.ts — Score and progression rules. Pure functions and combo helper.

import { LEVELING, SCORING } from '../config/gameConfig.ts';

/**
 * Formula from design doc: XP needed = 3 + level × 2.
 * Early levels come quickly so the player gets builds early.
 */
export function xpNeededForLevel(level: number): number {
  return LEVELING.BASE + level * LEVELING.SCALE;
}

/** Milestone chime calculation */
export function milestoneFor(score: number): number {
  return Math.floor(score / SCORING.MILESTONE_STEP) * SCORING.MILESTONE_STEP;
}

export class ComboTracker {
  count = 0;
  timer = 0;
  readonly windowSeconds = 2.5;

  update(dt: number): void {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.count = 0;
      }
    }
  }

  /**
   * Register a food consumed. Returns current multiplier (1 to 5).
   */
  registerEat(): number {
    this.count = Math.min(5, this.count + 1);
    this.timer = this.windowSeconds;
    return this.multiplier;
  }

  get multiplier(): number {
    return Math.max(1, this.count);
  }

  reset(): void {
    this.count = 0;
    this.timer = 0;
  }
}
