/**
 * Outbound signals to the host app, on channel `gameState`.
 *
 * Implemented by the bridge adapter; consumed by the scenes and the reporter.
 * This is the only port that speaks for the host bridge, and only
 * `MpBridge.ts` itself does the speaking (AGENTS.md A4.2).
 */
export interface ReportPort {
  /** Fires exactly once, after the player presses Play. */
  launch(): void;
  /** Fires at the start of every round, including after Retry. */
  startRound(): void;
  /** Fires when the Result Panel appears. */
  endRound(payload: { win: boolean; score: number }): void;
  /** Fires at most once, when Exit is pressed. */
  exit(payload: { lastWin: boolean; lastScore: number }): void;
}
