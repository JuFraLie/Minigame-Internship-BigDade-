import type { PlayerStrategyPort } from '../app/ports.ts';
import { Simulation } from '../domain/simulation.ts';
import { SIM_HZ, type RoundEvent } from '../domain/types.ts';

/**
 * Runs a whole level in memory: no Phaser, no DOM, no clock but the simulation's own.
 *
 * This is the tool the design document's testing section asks for — balance checks,
 * bot smoke tests and step-time benchmarks all come out of the same loop, which is why
 * the game's rules had to live in pure TypeScript in the first place.
 */

export interface RunOptions {
    /** Safety valve: simulated seconds before the run is abandoned. */
    maxSeconds?: number;
    /** How often the bot gets to look at the screen, in simulated seconds. */
    thinkSeconds?: number;
}

export interface RunResult {
    readonly level: number;
    readonly outcome: 'victory' | 'defeat';
    readonly score: number;
    readonly lives: number;
    readonly gold: number;
    readonly wavesCleared: number;
    /** Simulation steps actually executed. */
    readonly steps: number;
    /** Simulated seconds the run covered. */
    readonly seconds: number;
    /** Wall-clock milliseconds per simulation step. */
    readonly msPerStep: number;
}

/** One level played to its end by `bot`. */
export function runLevel(level: number, bot: PlayerStrategyPort, options: RunOptions = {}): RunResult {
    const maxSeconds = options.maxSeconds ?? 900;
    const thinkEvery = Math.max(1, Math.round((options.thinkSeconds ?? 0.5) * SIM_HZ));
    const maxSteps = Math.ceil(maxSeconds * SIM_HZ);

    const sim = new Simulation(level);
    const events: RoundEvent[] = [];
    let wavesCleared = 0;
    let steps = 0;

    const started = performance.now();
    for (let step = 0; step < maxSteps; step++) {
        if (steps % thinkEvery === 0 && sim.phase === 'playing') {
            for (const command of bot.decide(sim.snapshot())) sim.handle(command);
        }

        sim.step();
        steps += 1;

        sim.drainEvents(events);
        for (const event of events) {
            if (event.type === 'waveCleared') wavesCleared += 1;
        }
        events.length = 0;

        if (sim.phase !== 'playing') break;
    }
    const elapsedMs = performance.now() - started;

    return {
        level,
        outcome: sim.phase === 'won' ? 'victory' : 'defeat',
        score: sim.score,
        lives: sim.lives,
        gold: sim.gold,
        wavesCleared,
        steps,
        seconds: steps / SIM_HZ,
        msPerStep: steps === 0 ? 0 : elapsedMs / steps,
    };
}

/** Convenience: play levels `from`..`to` with the same bot factory. */
export function runLevels(
    from: number,
    to: number,
    makeBot: (spotCount: number) => PlayerStrategyPort,
    spotCounts: readonly number[],
): RunResult[] {
    const results: RunResult[] = [];
    for (let level = from; level <= to; level++) {
        const spotCount = spotCounts[(level - 1) % spotCounts.length] ?? 6;
        results.push(runLevel(level, makeBot(spotCount)));
    }
    return results;
}
