import type { BridgePort, RandomPort } from '../core/ports.ts';
import { GameWorld } from '../core/world.ts';

export interface RoundResult {
    readonly win: boolean;
    readonly score: number;
    readonly cleared: number;
    readonly totalCars: number;
    readonly maxCombo: number;
    readonly level: number;
}

export interface RoundSessionOptions {
    readonly bridge: BridgePort;
    /** Optional so a test can pin the level; defaults to `Math.random`. */
    readonly random?: RandomPort;
    /** Optional so a test can pin the starting level; defaults to 1. */
    readonly level?: number;
}

/**
 * Owns one round: it holds the world, forwards taps in grid coordinates, and finalises the
 * score exactly once when the round ends.
 *
 * It depends only on the bridge port, so it is testable with a fake host and never touches
 * a renderer (AGENTS.md §4.3).
 *
 * There is no timer here either: the scene calls `update()` and the world ticks.
 */
export class RoundSession {
    readonly world: GameWorld;
    readonly level: number;

    private readonly bridge: BridgePort;
    private reported = false;
    private accumulator = 0;

    constructor(options: RoundSessionOptions) {
        this.bridge = options.bridge;
        this.level = options.level ?? 1;
        this.world = new GameWorld(options.random ?? Math.random, this.level);
    }

    /** Tells the host a round is starting. Called at every round start, per AGENTS.md §4.2. */
    startRound(): void {
        this.reported = false;
        this.bridge.startRound();
    }

    update(dtSeconds: number): void {
        if (this.world.phase !== 'playing') return;

        // Fixed-step accumulation: the simulation always advances in whole ticks, so it
        // behaves identically at 30 FPS and 120 FPS, and a frame hitch cannot tunnel a
        // car through the ring.
        this.accumulator += dtSeconds;
        let steps = 0;
        while (this.accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
            this.world.tick();
            this.accumulator -= STEP;
            steps++;
        }
        // Drop whatever is left over rather than carrying a debt into the next frame.
        if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }

    /** The one door between the input adapter and the simulation. */
    tapCell(col: number, row: number): void {
        if (this.world.phase !== 'playing') return;
        this.world.tapCell(col, row);
    }

    get roundOver(): boolean {
        return this.world.phase !== 'playing';
    }

    /**
     * Signals `endRound` and returns the stats shown on the Result Panel.
     *
     * @returns null while the round is running, or when it has already been finalised.
     */
    finishRound(): RoundResult | null {
        if (this.reported || this.world.phase === 'playing') return null;

        this.reported = true;
        const result: RoundResult = {
            win: this.world.phase === 'won',
            score: this.world.scoreState.score,
            cleared: this.world.scoreState.cleared,
            totalCars: this.world.snapshot().totalCars,
            maxCombo: this.world.scoreState.maxCombo,
            level: this.level,
        };
        this.bridge.endRound(result.win, result.score);
        return result;
    }
}

const STEP = 1 / 60;

/** Ceiling on catch-up ticks, so a long hitch can never freeze the frame that follows it. */
const MAX_STEPS_PER_FRAME = 6;
