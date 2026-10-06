/**
 * Shared game-world value types.
 *
 * These are abstract game concepts only: no pixels, no Phaser, no DOM.
 * Anything that describes *where* something is drawn lives in the rendering
 * world (`src/presentation`), never here.
 */

/** The three signs of the triangle. */
export type Sign = 'ROCK' | 'PAPER' | 'SCISSORS';

/** Outcome of a single clash, from the player's point of view. */
export type ClashResult = 'WIN' | 'LOSE' | 'TIE';

/**
 * CHOOSING  – waiting for the player to tap a card.
 * RESOLVING – the reveal animation is playing; intents are ignored.
 * ENDED     – the run is over; the Result Panel is up. Intents are ignored.
 */
export type GamePhase = 'CHOOSING' | 'RESOLVING' | 'ENDED';

/** Read-only view of the game world, consumed by the renderer. */
export interface GameSnapshot {
  readonly phase: GamePhase;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly score: number;
  /** Wins in a row. A TIE keeps it, a LOSE resets it to 0. */
  readonly streak: number;
  /** Current multiplier: `min(max(streak, 1), 5)`. */
  readonly multiplier: number;
  /** Longest streak reached during this run. */
  readonly bestStreak: number;
  /** Increments only when a defeated enemy is replaced by a new one. */
  readonly enemyId: number;
}

/** The enemy's hidden sign is revealed together with the player's pick. */
export interface SignRevealedEvent {
  readonly playerSign: Sign;
  readonly enemySign: Sign;
  readonly result: ClashResult;
}

export interface EnemyDefeatedEvent {
  readonly enemyId: number;
  readonly points: number;
  readonly multiplier: number;
  /** Streak *after* this win. */
  readonly streak: number;
  /** Score *after* this win. */
  readonly score: number;
}

export interface HeartLostEvent {
  readonly heartsLeft: number;
  /** The streak that was thrown away by this loss (0 when it was already 0). */
  readonly streakLost: number;
  readonly runOver: boolean;
}

export interface ClashTiedEvent {
  readonly streak: number;
  readonly heartsLeft: number;
}

export interface RunEndedEvent {
  readonly score: number;
  readonly bestStreak: number;
}
