/**
 * Outbound signals to the host app, on channel `gameState`.
 *
 * Implemented by the bridge adapter; consumed by the scenes and the reporter.
 */
export interface HostSignalPort {
  /** Fires exactly once, after the player presses Play. */
  launch(): void;
  /** Fires at the start of every run, including after Retry. */
  startRound(): void;
  /** Fires when the Result Panel appears. Endless game: `win` is always true. */
  endRound(payload: { win: boolean; score: number }): void;
  /** Fires at most once, when Exit is pressed. */
  exit(payload: { lastWin: boolean; lastScore: number }): void;
}
