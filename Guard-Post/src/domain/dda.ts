import {
    DDA_ARMOR_PER_TIER,
    DDA_HP_PER_TIER,
    DDA_SCORE_PER_TIER,
    DDA_SPEED_PER_TIER,
    MAX_DDA_TIER,
} from './types.ts';

/**
 * Dynamic difficulty adjustment.
 *
 * The rule is deliberately tied to the player's health: a clean wave or level earns a
 * tier and therefore a harder, better-paying round; any leak wipes the tiers back to
 * normal. Nothing here is persisted and nothing knows about renderers — it is pure
 * arithmetic over a tier, so the same rules run headlessly in the tests and bots.
 */
export type DdaReason = 'clean' | 'leak';

export function clampDdaTier(tier: number): number {
    if (!Number.isFinite(tier)) return 0;
    return Math.max(0, Math.min(MAX_DDA_TIER, Math.floor(tier)));
}

/** A clean step climbs one tier; a leak drops straight back to normal. */
export function nextDdaTier(tier: number, reason: DdaReason): number {
    return reason === 'leak' ? 0 : Math.min(MAX_DDA_TIER, clampDdaTier(tier) + 1);
}

export function ddaScoreMultiplier(tier: number): number {
    return 1 + DDA_SCORE_PER_TIER * clampDdaTier(tier);
}

export function ddaHpMultiplier(tier: number): number {
    return 1 + DDA_HP_PER_TIER * clampDdaTier(tier);
}

export function ddaArmorBonus(tier: number): number {
    return DDA_ARMOR_PER_TIER * clampDdaTier(tier);
}

export function ddaSpeedMultiplier(tier: number): number {
    return 1 + DDA_SPEED_PER_TIER * clampDdaTier(tier);
}

export interface EnemyStats {
    readonly hp: number;
    readonly armor: number;
    readonly speed: number;
}

/** Applies the tier to already level-scaled enemy stats. */
export function scaleEnemyStats(base: EnemyStats, tier: number): EnemyStats {
    return {
        hp: Math.round(base.hp * ddaHpMultiplier(tier)),
        armor: Math.round(base.armor + ddaArmorBonus(tier)),
        speed: base.speed * ddaSpeedMultiplier(tier),
    };
}
