/**
 * Outbound commands for feedback the player hears.
 *
 * Implemented by the Web Audio adapter; consumed by the scenes. The game
 * world never knows that sound exists — the renderer decides when a cue
 * plays, so audio stays a pure presentation concern.
 */
export interface SoundPort {
  /** Must be called from a user gesture, otherwise mobile WebViews stay silent. */
  unlock(): void;
  /** Card tapped. */
  tap(): void;
  /** The enemy's pick flips over. */
  reveal(): void;
  /** Enemy defeated — the pitch may climb with the streak. */
  win(streak: number): void;
  /** Heart lost. */
  lose(): void;
  /** Tie. */
  tie(): void;
  /** Run over. */
  gameOver(): void;
}
