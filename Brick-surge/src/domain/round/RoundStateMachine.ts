/**
 * Round state machine: waves, serving, win/lose, and the single endRound event.
 *
 * The machine owns the round skeleton only — it does not touch balls, bricks
 * or scoring. The session feeds it facts ("bricks cleared", "ball lost") and
 * reads the resulting phase and timers.
 */

import { BANNER_SECONDS, WAVE_COUNT } from '../config.ts';
import type { ClockPort } from '../ports.ts';
import type { RoundPhase } from '../types.ts';

export type RoundSignal =
    | { type: 'roundStarted'; wave: number }
    | { type: 'waveBanner'; wave: number }
    | { type: 'waveStarted'; wave: number }
    | { type: 'roundEnded'; win: boolean };

export class RoundStateMachine {
    private phaseInternal: RoundPhase = 'idle';
    private waveInternal = 1;
    private timer = 0;           // countdown seconds left for serving/banner
    private lastTickMs: number | undefined;
    private endEmitted = false;
    private winInternal = false;

    private readonly clock: ClockPort;
    private readonly waveCount: number;
    private readonly bannerSeconds: number;

    constructor(
        clock: ClockPort,
        waveCount: number = WAVE_COUNT,
        bannerSeconds: number = BANNER_SECONDS,
    ) {
        this.clock = clock;
        this.waveCount = waveCount;
        this.bannerSeconds = bannerSeconds;
    }

    get phase(): RoundPhase { return this.phaseInternal; }
    get wave(): number { return this.waveInternal; }
    get win(): boolean { return this.winInternal; }
    /** Seconds left in the current serving/banner countdown (0 outside those phases). */
    get timerSeconds(): number {
        return this.phaseInternal === 'serving' || this.phaseInternal === 'banner'
            ? Math.max(0, this.timer)
            : 0;
    }

    /** Begin a fresh round at wave 1 in the serving phase. */
    start(serveSeconds: number): RoundSignal[] {
        this.phaseInternal = 'serving';
        this.waveInternal = 1;
        this.endEmitted = false;
        this.winInternal = false;
        this.beginCountdown(serveSeconds);
        return [{ type: 'roundStarted', wave: 1 }];
    }

    /**
     * All bricks of the current wave are gone. Advances to the next wave
     * (with the inter-wave banner) or ends the round as a win.
     */
    waveCleared(): RoundSignal[] {
        if (this.phaseInternal !== 'playing') return [];
        if (this.waveInternal >= this.waveCount) return this.end(true);
        this.phaseInternal = 'banner';
        this.beginCountdown(this.bannerSeconds);
        return [{ type: 'waveBanner', wave: this.waveInternal + 1 }];
    }

    /** The last ball was lost — end the round as a loss. */
    lost(): RoundSignal[] {
        return this.end(false);
    }

    /**
     * Tick the active countdown (serving or banner). Returns the signals that
     * became due: waveStarted when a banner ends; nothing when a serve ends
     * (the session spawns the ball by observing phase === 'playing').
     */
    update(): RoundSignal[] {
        if (this.phaseInternal !== 'serving' && this.phaseInternal !== 'banner') return [];
        const now = this.clock.now();
        if (this.lastTickMs === undefined) { this.lastTickMs = now; return []; }
        this.timer -= (now - this.lastTickMs) / 1000;
        this.lastTickMs = now;
        if (this.timer > 0) return [];

        if (this.phaseInternal === 'banner') {
            this.waveInternal++;
            this.phaseInternal = 'playing';
            this.lastTickMs = undefined;
            return [{ type: 'waveStarted', wave: this.waveInternal }];
        }
        // Serving countdown done: the session notices phase === 'playing' and serves.
        this.phaseInternal = 'playing';
        this.lastTickMs = undefined;
        return [];
    }

    private beginCountdown(seconds: number): void {
        this.timer = seconds;
        this.lastTickMs = undefined;
    }

    /** End the round exactly once — endRound can never fire twice. */
    private end(win: boolean): RoundSignal[] {
        if (this.endEmitted) return [];
        this.endEmitted = true;
        this.winInternal = win;
        this.phaseInternal = 'ended';
        this.timer = 0;
        this.lastTickMs = undefined;
        return [{ type: 'roundEnded', win }];
    }
}
