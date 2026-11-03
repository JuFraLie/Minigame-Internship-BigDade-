import type { BridgePort } from '../domain/ports.ts';
import {
    webviewSignalEndRound,
    webviewSignalExit,
    webviewSignalLaunch,
    webviewSignalStartRound,
} from './MpBridge.ts';

/**
 * Adapter: exposes the host shell through the game's bridge port.
 *
 * `MpBridge.ts` stays the only file that reaches the host — and this suite in
 * `tests/layers.test.ts` greps for the host API by name to prove it. This wrapper adds
 * the guarantees the repository rules ask for and that the raw module does not enforce:
 * `launch` exactly once per session, `endRound` at most once per round, `exit` at most
 * once per session. `startRound` deliberately re-arms `endRound`, because Retry and
 * Next Level are new rounds that must report their own result.
 */
export function createHostBridge(): BridgePort {
    let launchSent = false;
    let exitSent = false;
    let roundEnded = false;

    return {
        launch(): void {
            if (launchSent) return;
            launchSent = true;
            webviewSignalLaunch();
        },
        startRound(): void {
            roundEnded = false;
            webviewSignalStartRound();
        },
        endRound(win: boolean, score: number): void {
            if (roundEnded) return;
            roundEnded = true;
            webviewSignalEndRound(win, score);
        },
        exit(win: boolean, score: number): void {
            if (exitSent) return;
            exitSent = true;
            webviewSignalExit(win, score);
        },
    };
}
