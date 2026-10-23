/**
 * Dynamic Difficulty Adjustment.
 *
 * Reads simple gameplay signals (never pixels), combines them into a Skill
 * Score S in [0, 1] with an exponential moving average, then maps S onto a
 * Difficulty Level D in [-3, +3]. D moves at most one step at a time and at
 * most once every `cooldownMs`, which keeps it from flickering.
 *
 * Session-only by design: no storage, every launch starts at 0.5 / D = 0.
 */

import { BASE_SERVE_SECONDS } from '../config.ts';
import type { ClockPort } from '../ports.ts';

export const MIN_LEVEL = -3;
export const MAX_LEVEL = 3;

/** Everything the game needs to know about the current difficulty. */
export interface DifficultyParams {
    /** Multiplier applied to the base ball speed. */
    ballSpeedMul: number;
    /** Multiplier applied to the base paddle width. */
    paddleWidthMul: number;
    /** Probability that a destroyed brick drops a power-up. */
    dropChance: number;
    /** Weight of the "bad" Shrink drop in the weighted roll (0 = never). */
    shrinkWeight: number;
    /** Multiplier for the Tough/Sturdy share of the *next* wave (0.7 .. 1.3). */
    brickToughShareMul: number;
    /** Auto-serve countdown in seconds. */
    serveSeconds: number;
}

export const NEUTRAL_PARAMS: DifficultyParams = {
    ballSpeedMul: 1,
    paddleWidthMul: 1,
    dropChance: 0.16,
    shrinkWeight: 1,
    brickToughShareMul: 1,
    serveSeconds: BASE_SERVE_SECONDS,
};

/** Piecewise map: level -3..0 interpolates easy→neutral, 0..+3 neutral→hard.
 *  This keeps level 0 exactly on the neutral column of the design table (§7.2). */
const lerp = (level: number, easy: number, neutral: number, hard: number): number => {
    const d = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
    return d <= 0
        ? easy + ((neutral - easy) * (d - MIN_LEVEL)) / (0 - MIN_LEVEL)
        : neutral + ((hard - neutral) * d) / MAX_LEVEL;
};

/** Parameters for a given difficulty level (design doc §7.2 table, softened
 *  towards the Ballz feel: the easy end is genuinely easy, the hard end only
 *  bites lightly — the paddle stays wide and the ball stays readable). */
export function paramsForLevel(level: number): DifficultyParams {
    const d = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
    return {
        ballSpeedMul: lerp(d, 0.75, 1, 1.15),
        paddleWidthMul: lerp(d, 1.35, 1, 0.9),
        dropChance: lerp(d, 0.22, 0.16, 0.11),
        shrinkWeight: Math.round(lerp(d, 0, 1, 3)),
        brickToughShareMul: lerp(d, 0.7, 1, 1.2),
        serveSeconds: lerp(d, 2, 1.5, 1.2),
    };
}

/**
 * Signal weights: how strongly each observation pulls the skill estimate.
 * Negative = the player struggled, positive = the player dominated. These are
 * applied as EMA steps so a single mistake never swings the game.
 */
const ALPHA = {
    // One life lost alone must NOT move D (anti-exploit, §7.3): the EMA step is
    // half the weight, so a single death leaves S above the -1 boundary. Two or
    // three struggle events are needed before the game eases.
    lifeLost: -0.16,
    nearMiss: -0.06,
    rallyLong: -0.08,
    rallyShort: 0.05,
    dropCaught: 0.04,
    dropMissed: -0.03,
    cleanStreakBrick: 0.015,
    waveClearFast: 0.22,
    waveClearSlow: -0.18,
};

/** A wave faster than `RALLY.fastFactor * target` counts as a fast clear. */
const FAST_WAVE_FACTOR = 0.7;
const SLOW_WAVE_FACTOR = 1.25;
/** Rallys longer than this (s) read as stalling; shorter as confident play. */
const LONG_RALLY_SECONDS = 6;
const SHORT_RALLY_SECONDS = 2;

/** Hysteresis: S must cross this distance past a level boundary to move D. */
const HYSTERESIS = 0.06;
/** Minimum time between level steps. */
const DEFAULT_COOLDOWN_MS = 8000;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export class DdaController {
    private skill = 0.5;                 // S, starts neutral
    private level = 0;                   // D, starts neutral
    private lastStepAt = -Infinity;      // ms timestamp of the last level step
    private readonly cooldownMs: number;
    private readonly clock: ClockPort;

    constructor(clock: ClockPort, cooldownMs: number = DEFAULT_COOLDOWN_MS) {
        this.clock = clock;
        this.cooldownMs = cooldownMs;
    }

    get skillScore(): number { return this.skill; }
    get difficultyLevel(): number { return this.level; }

    /** Current tuning parameters for the game. */
    get params(): DifficultyParams { return paramsForLevel(this.level); }

    // ---- Signals (all pull S up or down; none of them moves D directly) ----

    /** A life was lost — the strongest struggle signal. */
    onLifeLost(): void { this.pull(ALPHA.lifeLost); }

    /** The ball fell just off the paddle edge — a near miss. */
    onNearMiss(): void { this.pull(ALPHA.nearMiss); }

    /** Seconds since the previous brick hit. Long gaps read as stalling. */
    onRally(seconds: number): void {
        if (seconds >= LONG_RALLY_SECONDS) this.pull(ALPHA.rallyLong);
        else if (seconds <= SHORT_RALLY_SECONDS) this.pull(ALPHA.rallyShort);
    }

    /** A dropped power-up was collected (or missed). */
    onDropResult(caught: boolean): void {
        this.pull(caught ? ALPHA.dropCaught : ALPHA.dropMissed);
    }

    /** A brick was destroyed without losing a ball — small, repeated positive push. */
    onCleanBrick(): void { this.pull(ALPHA.cleanStreakBrick); }

    /** A wave was cleared; `elapsedSeconds` vs the design target decides the push. */
    onWaveCleared(targetSeconds: number, elapsedSeconds: number): void {
        const ratio = elapsedSeconds / Math.max(targetSeconds, 0.001);
        if (ratio <= FAST_WAVE_FACTOR) this.pull(ALPHA.waveClearFast);
        else if (ratio >= SLOW_WAVE_FACTOR) this.pull(ALPHA.waveClearSlow);
        // Between the two factors the clear was on pace: no push.
    }

    /**
     * Try to move D one step towards the level implied by S. Respects the
     * cooldown and a hysteresis band around each level boundary, so D never
     * flickers back and forth. Called by the session every update tick.
     */
    update(): void {
        const now = this.clock.now();
        if (now - this.lastStepAt < this.cooldownMs) return;

        const target = this.targetLevel();
        if (target === this.level) return;

        this.lastStepAt = now;
        this.level += target > this.level ? 1 : -1;
    }

    /** Test seam: force a level (used by unit tests, never by the game). */
    forceLevel(level: number): void {
        this.level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
    }

    // ---- internals ----

    /** One EMA step towards (0.5 + delta), keeping S in [0, 1]. */
    private pull(delta: number): void {
        this.skill = clamp01(this.skill + delta * 0.5);
    }

    /**
     * The level S currently implies, with hysteresis: from the current level we
     * only consider a neighbour if S is past its boundary by HYSTERESIS.
     */
    private targetLevel(): number {
        // S boundaries for levels -3..3 sit at 1/6, 2/6 ... 5/6 (0.5 = level 0).
        const centre = this.skill * 6 - 3; // continuous -3..3
        const raw = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(centre)));
        if (raw === this.level) return raw;
        // Hysteresis: require extra distance before stepping off the current level.
        const margin = HYSTERESIS * 6;
        if (raw > this.level && centre < this.level + 0.5 + margin) return this.level;
        if (raw < this.level && centre > this.level - 0.5 - margin) return this.level;
        return raw;
    }
}
