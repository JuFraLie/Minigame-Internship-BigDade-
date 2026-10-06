import type { ClashResult, Sign } from './types.ts';

/** Fixed order of the player's hand: Rock, Paper, Scissors. */
export const SIGNS: readonly Sign[] = ['ROCK', 'PAPER', 'SCISSORS'] as const;

/** Points awarded for a win at multiplier x1. */
export const BASE_POINTS = 100;

/** The multiplier never climbs past this. */
export const MULTIPLIER_CAP = 5;

/** True when `attacker` defeats `defender`. */
export function beats(attacker: Sign, defender: Sign): boolean {
  return (
    (attacker === 'ROCK' && defender === 'SCISSORS') ||
    (attacker === 'SCISSORS' && defender === 'PAPER') ||
    (attacker === 'PAPER' && defender === 'ROCK')
  );
}

/** Resolve one clash from the player's point of view. */
export function resolveClash(player: Sign, enemy: Sign): ClashResult {
  if (player === enemy) return 'TIE';
  return beats(player, enemy) ? 'WIN' : 'LOSE';
}

/**
 * Multiplier for the win that raises the streak to `streak`
 * (x1, x2, x3, x4, then x5 and capped). A streak of 0 reports x1 so the HUD
 * always shows a usable number.
 */
export function multiplierForStreak(streak: number): number {
  if (streak <= 1) return 1;
  return Math.min(streak, MULTIPLIER_CAP);
}

/** Points earned by the win that raises the streak to `streak`. */
export function pointsForStreak(streak: number): number {
  return BASE_POINTS * multiplierForStreak(streak);
}
