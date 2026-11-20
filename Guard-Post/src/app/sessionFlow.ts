import { clampDdaTier } from '../domain/dda.ts';
import { STARTING_LIVES } from '../domain/types.ts';
import type { HostPort } from './ports.ts';

/**
 * The screen-flow state machine: Play → Playing ⇄ Paused → Result.
 *
 * It owns the level counter and the last reported result, and it is the single place
 * that decides when `launch`, `startRound`, `endRound` and `exit` fire — the scenes only
 * tell it what happened. Nothing here is persisted: a fresh session always starts at
 * level 1.
 *
 * The rules (AGENTS.md §2) are enforced by the transition guards, not by the callers:
 * there is no path from Pause to a restart, and no path from anywhere but the Result
 * Panel to Exit.
 */

/**
 * AGENTS.md §4.2: "Endless/infinite games MUST send `win: true`."
 *
 * Guard Post is endless in progression, so every round — victory or defeat — reports
 * win: true to the host (confirmed 11 November 2026, design document open question 1).
 * The Result Panel still shows the real outcome to the player; only the host payload is
 * affected.
 */
export const ROUND_REPORTED_WIN = true;

export type FlowState = 'play' | 'playing' | 'paused' | 'result';

/** What the player achieved, for the Result Panel. */
export type RoundOutcome = 'victory' | 'defeat';

export interface SessionFlow {
    readonly state: FlowState;
    readonly level: number;
    /** The outcome shown on the Result Panel, or `null` before the first round ends. */
    readonly outcome: RoundOutcome | null;
    readonly lastScore: number;
    /** Health carried into the next round; no regen, no reset on a new level. */
    readonly lives: number;
    /** Difficulty carried into the next round; a leak drops it back to normal. */
    readonly ddaTier: number;
    /** The Play button (or a tap anywhere on the Play Screen) was pressed. */
    onPlay(): void;
    /** A round is starting — every Retry and Next Level included. */
    beginRound(): void;
    pause(): void;
    resume(): void;
    /** The round ended; shows the Result Panel and reports the score. */
    endRound(outcome: RoundOutcome, score: number, lives?: number, ddaTier?: number): void;
    /** Result Panel → Retry: the same level, straight back to gameplay. */
    retry(): void;
    /** Result Panel → Next Level: level + 1, straight back to gameplay. */
    nextLevel(): void;
    /** Result Panel → Exit: the bridge signal, once, and nothing else. */
    exit(): void;
}

export function createSessionFlow(host: HostPort): SessionFlow {
    let state: FlowState = 'play';
    let level = 1;
    let outcome: RoundOutcome | null = null;
    let lastScore = 0;
    let lastWin = ROUND_REPORTED_WIN;
    let carriedLives = STARTING_LIVES;
    let carriedDdaTier = 0;

    let launchSent = false;
    let roundEnded = true; // no round is running before the first beginRound()
    let exitSent = false;

    return {
        get state(): FlowState {
            return state;
        },
        get level(): number {
            return level;
        },
        get outcome(): RoundOutcome | null {
            return outcome;
        },
        get lastScore(): number {
            return lastScore;
        },
        get lives(): number {
            return carriedLives;
        },
        get ddaTier(): number {
            return carriedDdaTier;
        },

        onPlay(): void {
            if (state !== 'play') return;
            state = 'playing';
            if (launchSent) return;
            launchSent = true;
            host.launch();
        },

        beginRound(): void {
            state = 'playing';
            roundEnded = false;
            host.startRound();
        },

        pause(): void {
            if (state !== 'playing') return;
            state = 'paused';
        },

        resume(): void {
            if (state !== 'paused') return;
            state = 'playing';
        },

        endRound(result: RoundOutcome, score: number, lives = carriedLives, ddaTier = carriedDdaTier): void {
            if (state !== 'playing' || roundEnded) return;
            roundEnded = true;
            outcome = result;
            lastScore = score;
            lastWin = ROUND_REPORTED_WIN;
            carriedLives = Math.max(0, Math.floor(lives));
            carriedDdaTier = clampDdaTier(ddaTier);
            state = 'result';
            host.endRound(lastWin, score);
        },

        retry(): void {
            if (state !== 'result') return;
            // Death ends the run; replaying a lost level starts a fresh one. A victory
            // retry keeps the surviving health and the earned difficulty, same as Next Level.
            if (outcome === 'defeat') {
                carriedLives = STARTING_LIVES;
                carriedDdaTier = 0;
            }
            outcome = null;
            state = 'playing';
        },

        nextLevel(): void {
            if (state !== 'result') return;
            if (outcome === 'defeat') {
                carriedLives = STARTING_LIVES;
                carriedDdaTier = 0;
            }
            outcome = null;
            level += 1;
            state = 'playing';
        },

        exit(): void {
            if (state !== 'result' || exitSent) return;
            exitSent = true;
            host.exit(lastWin, lastScore);
        },
    };
}
