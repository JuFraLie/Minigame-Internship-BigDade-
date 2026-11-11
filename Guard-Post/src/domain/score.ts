import { ENEMY_SPECS, type EnemyType } from './types.ts';

/**
 * Score rules. The score is per round (one level), reported to the host only through the
 * bridge, and never stored locally. Everything scales with the level, so a deep run is
 * always worth more than replaying early ones.
 */

/** Kill: base reward x 10 x (1 + 0.1 x (L - 1)), rounded. */
export function killScore(type: EnemyType, level: number): number {
    return Math.round(ENEMY_SPECS[type].reward * 10 * (1 + 0.1 * (level - 1)));
}

/** Wave cleared: 100 x L. */
export function waveClearScore(level: number): number {
    return 100 * level;
}

/** Level cleared: remaining lives x 50 x L. Defeats earn no clear bonus. */
export function levelClearScore(lives: number, level: number): number {
    return lives * 50 * level;
}
