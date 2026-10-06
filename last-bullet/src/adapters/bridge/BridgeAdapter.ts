import type { ReportPort } from '../../ports/ReportPort.ts';
import {
  webviewSignalEndRound,
  webviewSignalExit,
  webviewSignalLaunch,
  webviewSignalStartRound,
} from './MpBridge.ts';

/**
 * `ReportPort` implementation, and therefore the only consumer of the
 * canonical bridge module. It owns the two "exactly once" rules:
 *
 *  - `launch` fires once, after the player presses Play,
 *  - `exit` fires at most once, when Exit is pressed.
 *
 * `startRound` and `endRound` are deliberately unguarded: every round starts
 * and ends, including after Retry.
 */
export class BridgeAdapter implements ReportPort {
  private launched = false;
  private exited = false;

  launch(): void {
    if (this.launched) return;
    this.launched = true;
    webviewSignalLaunch();
  }

  startRound(): void {
    webviewSignalStartRound();
  }

  endRound(payload: { win: boolean; score: number }): void {
    webviewSignalEndRound(payload.win, payload.score);
  }

  exit(payload: { lastWin: boolean; lastScore: number }): void {
    if (this.exited) return;
    this.exited = true;
    webviewSignalExit(payload.lastWin, payload.lastScore);
  }
}
