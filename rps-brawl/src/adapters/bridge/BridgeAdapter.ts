import type { HostSignalPort } from '../../ports/HostSignalPort.ts';
import {
  webviewSignalEndRound,
  webviewSignalExit,
  webviewSignalLaunch,
  webviewSignalStartRound,
} from './MpBridge.ts';

/**
 * `HostSignalPort` implementation. It is the only consumer of the canonical
 * bridge module, and it owns the two "exactly once" rules:
 *
 *  - `launch` fires once, after the player presses Play,
 *  - `exit` fires at most once, when Exit is pressed.
 */
export class BridgeAdapter implements HostSignalPort {
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
