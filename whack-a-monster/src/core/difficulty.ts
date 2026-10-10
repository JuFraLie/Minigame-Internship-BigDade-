import { DIFFICULTY } from './config.ts';
import type { MonsterKind } from './config.ts';
import type { Random } from './ports.ts';

/**
 * Decides when the next monster comes up, how fast the round runs and which kind spawns.
 * The random source is injected so tests can replay a fixed sequence.
 */
export class SpawnScheduler {
    private readonly random: Random;
    private elapsedMs = 0;

    constructor(random: Random) {
        this.random = random;
    }

    /** Starts the round clock so the first monster appears almost immediately. */
    reset(): void {
        this.elapsedMs = DIFFICULTY.firstSpawnDelayMs;
    }

    /** Scales monster speed with the number of kills, capped by the tuning table. */
    speedMultiplier(defeated: number): number {
        return Math.min(
            DIFFICULTY.maxSpeedMultiplier,
            1 + defeated * DIFFICULTY.speedGainPerKill,
        );
    }

    /**
     * Accumulates time and reports whether a spawn is due.
     *
     * @returns true at most once per call; the accumulated time is consumed when it does.
     */
    shouldSpawn(dtSeconds: number, defeated: number): boolean {
        this.elapsedMs += dtSeconds * 1000;

        const interval = Math.max(
            DIFFICULTY.minIntervalMs,
            DIFFICULTY.baseIntervalMs - defeated * DIFFICULTY.intervalDecayMsPerKill,
        );

        if (this.elapsedMs < interval) return false;

        this.elapsedMs = 0;
        return true;
    }

    nextKind(): MonsterKind {
        const roll = this.random();
        if (roll > DIFFICULTY.ninjaRollCeiling) return 'ninja';
        if (roll > DIFFICULTY.armoredRollCeiling) return 'armored';
        return 'normal';
    }

    /** Whether the difficulty is high enough to risk a second simultaneous monster. */
    wantsDoubleSpawn(defeated: number): boolean {
        return (
            this.speedMultiplier(defeated) > DIFFICULTY.doubleSpawnSpeedThreshold &&
            this.random() < DIFFICULTY.doubleSpawnChance
        );
    }
}
