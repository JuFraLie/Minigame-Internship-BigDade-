import {
    ENEMY_SPECS,
    SELL_REFUND_RATE,
    TOWER_SPECS,
    UPGRADE_COST_FACTOR,
    type EnemyType,
    type TowerType,
} from './types.ts';

/**
 * The gold rules of one level. Nothing here is persisted: every level starts with fresh
 * gold, and the only sinks are building and upgrading.
 */

/** Gold at the start of level `L`. */
export function startingGold(level: number): number {
    return 100 + 20 * (level - 1);
}

/** Gold dropped by a kill at level `L`: base reward x (1 + 0.06 x (L - 1)), rounded. */
export function killReward(type: EnemyType, level: number): number {
    return Math.round(ENEMY_SPECS[type].reward * (1 + 0.06 * (level - 1)));
}

/** Bonus for emptying a wave: 15 + 3 x L. */
export function waveClearBonus(level: number): number {
    return 15 + 3 * level;
}

/**
 * Gold for calling the next wave early: 2 per full second skipped.
 *
 * Only the 8-second gap between waves can be skipped for gold; the opening grace period
 * is free to skip, so this is never called with it.
 */
export function earlyCallBonus(secondsSkipped: number): number {
    return 2 * Math.floor(secondsSkipped);
}

/** Cost of buying tower level `nextLevel` (2 or 3), as a multiple of the base cost. */
export function upgradeCost(tower: TowerType, nextLevel: number): number {
    const factor = UPGRADE_COST_FACTOR[nextLevel - 1] ?? 0;
    return Math.round(TOWER_SPECS[tower].cost * factor);
}

/** 70% of everything spent on the tower, rounded down. */
export function sellRefund(spent: number): number {
    return Math.floor(spent * SELL_REFUND_RATE);
}
