import type { HostPort } from '../app/ports.ts';
import {
    webviewSignalEndRound,
    webviewSignalExit,
    webviewSignalLaunch,
    webviewSignalStartRound,
} from './MpBridge.ts';

/**
 * Adapter: exposes the host shell through the game's `HostPort`.
 *
 * `MpBridge.ts` stays the only file that reaches `window.MpPostMessage` — the layers
 * suite greps for the host API by name to prove it. This wrapper is deliberately thin:
 * the once-per-session and once-per-round guarantees live in the session flow, which is
 * the component that decides *when* the signals fire.
 */
export function createHostBridge(): HostPort {
    return {
        launch(): void {
            webviewSignalLaunch();
        },
        startRound(): void {
            webviewSignalStartRound();
        },
        endRound(win: boolean, score: number): void {
            webviewSignalEndRound(win, score);
        },
        exit(win: boolean, score: number): void {
            webviewSignalExit(win, score);
        },
    };
}
