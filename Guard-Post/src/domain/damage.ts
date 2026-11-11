import { BOSS_SLOW_RESISTANCE } from './types.ts';

/**
 * Damage and slow rules.
 *
 * Armor reduces damage by percentage: `effective = raw x 100 / (100 + armor x (1 - pierce))`.
 * A Dart (no pierce) hits a 40-armor Brute for 71% of its damage; a Cannon (50% pierce)
 * hits it for 83%.
 *
 * Slows never stack: the strongest active slow wins, and a weaker hit cannot overwrite a
 * stronger one. Bosses shrug off half of every slow.
 */

/** Damage actually dealt through `armor`, given the attacker's armor pierce. */
export function effectiveDamage(raw: number, armor: number, armorPierce: number): number {
    if (armor <= 0) return raw;
    return (raw * 100) / (100 + armor * (1 - armorPierce));
}

/** The slow currently hanging on an enemy. */
export interface SlowState {
    /** Active strength, 0..1. */
    strength: number;
    /** Seconds left before it wears off. */
    seconds: number;
}

export function noSlow(): SlowState {
    return { strength: 0, seconds: 0 };
}

/**
 * Applies a slow hit, strongest-wins.
 *
 * Returns `true` when this hit became (or refreshed) the active slow — the renderer and
 * tests use that to tell a real application from an overwritten one.
 */
export function applySlow(state: SlowState, strength: number, seconds: number, isBoss: boolean): boolean {
    if (strength <= 0 || seconds <= 0) return false;
    const effective = isBoss ? strength * (1 - BOSS_SLOW_RESISTANCE) : strength;
    // Weaker hits are ignored; equal or stronger refresh the timer and take over.
    if (effective < state.strength) return false;
    state.strength = effective;
    state.seconds = seconds;
    return true;
}

/** Ticks a slow down by one step of `dt` seconds. */
export function tickSlow(state: SlowState, dt: number): void {
    if (state.seconds <= 0) return;
    state.seconds -= dt;
    if (state.seconds <= 0) {
        state.seconds = 0;
        state.strength = 0;
    }
}

/** Multiplier applied to an enemy's speed while slowed: 1.0 at strength 0. */
export function speedMultiplier(state: SlowState): number {
    return 1 - state.strength;
}
