// scoring.ts — score progression rules: how fast the world moves and when the
// milestone chime fires. Pure functions, no state.

import { SCORING } from '../config/gameConfig.ts';

/** Scroll speed in px/s for a given score — starts slow, ramps up to a cap. */
export function scrollSpeed(score: number): number {
  return Math.min(SCORING.MAX_SPEED, SCORING.BASE_SPEED + score * SCORING.SPEED_RAMP);
}

/** Highest milestone (100, 200, …) already reached by this score. */
export function milestoneFor(score: number): number {
  return Math.floor(score / SCORING.MILESTONE_STEP) * SCORING.MILESTONE_STEP;
}
