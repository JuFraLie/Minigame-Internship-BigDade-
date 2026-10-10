import type { BridgePort } from '../core/ports.ts';
import {
    webviewSignalEndRound,
    webviewSignalExit,
    webviewSignalLaunch,
    webviewSignalStartRound,
} from '../jsbridge.ts';

/**
 * Adapter: exposes the host shell through the game's bridge port.
 *
 * `jsbridge.ts` stays the only file that touches `window.MpPostMessage`; this adapter adds
 * the ordering guarantees AGENTS.md §4.2 asks for — `launch` at most once per session,
 * `endRound` at most once per round, `exit` at most once per session — so a double tap on
 * a button can never leak a duplicate signal.
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

/** The bridge the app wires into every scene. */
export const hostBridge: BridgePort = createHostBridge();
