/** Bridge port implementation on top of the preserved jsbridge module. */

import type { GameSignalsPort } from '../../domain/ports.ts';
import {
    webviewSignalEndRound,
    webviewSignalExit,
    webviewSignalLaunch,
    webviewSignalStartRound,
} from './jsbridge.ts';

/**
 * The only consumer of jsbridge.ts. Keeps the launch-once / exit-at-most-once
 * guarantees required by AGENTS.md §4.2 in a single auditable place.
 */
export class MpBridge implements GameSignalsPort {
    private launched = false;
    private exited = false;

    /** Guard against double-firing when the player taps Play twice quickly. */
    signalLaunch(): void {
        if (this.launched) return;
        this.launched = true;
        webviewSignalLaunch();
    }

    signalStartRound(): void {
        webviewSignalStartRound();
    }

    signalEndRound(win: boolean, score: number): void {
        webviewSignalEndRound(win, score);
    }

    /** Exit fires at most once and does nothing else (AGENTS.md §2). */
    signalExit(win: boolean, score: number): void {
        if (this.exited) return;
        this.exited = true;
        webviewSignalExit(win, score);
    }
}
