import { ENEMY_SPECS, ENEMY_TYPES, WAVES_PER_LEVEL, type EnemyType } from './types.ts';

/**
 * Deterministic wave generation from a threat budget.
 *
 * No wave is hand-written and no random number is drawn: `generateWave(level, wave)`
 * always returns the same schedule, which is what makes the whole game testable by a
 * bot and reproducible in a unit test.
 *
 * Budget for wave `w` (1..3) at level `L`:
 *     (8 + 2.5 x (L - 1)) x (1 + 0.35 x (w - 1))
 * Composition by wave:
 *     wave 1             grunts only
 *     wave 2             50% grunts, 50% runners, by budget
 *     wave 3, level >= 3 40% brutes, 30% runners, 30% grunts, by budget
 *     wave 3, level < 3  50% grunts, 50% runners, by budget
 * Every 5th level appends one boss to wave 3, on top of the budget.
 */

export interface SpawnEntry {
    /** Seconds after the wave starts. */
    readonly time: number;
    readonly type: EnemyType;
}

type Group = readonly [EnemyType, number];

/** Threat budget for one wave of one level. */
export function waveBudget(level: number, wave: number): number {
    return (8 + 2.5 * (level - 1)) * (1 + 0.35 * (wave - 1));
}

/** How many enemies of one type fit into a share of the budget. */
function countFor(share: number, type: EnemyType): number {
    return Math.floor(share / ENEMY_SPECS[type].threat);
}

/** The enemy groups of a wave, in spawn order, as [type, count] pairs. */
function groupsFor(level: number, wave: number, budget: number): readonly Group[] {
    if (wave === 1) return [['grunt', countFor(budget, 'grunt')]];
    if (wave === 2 || level < 3) {
        return [
            ['grunt', countFor(budget * 0.5, 'grunt')],
            ['runner', countFor(budget * 0.5, 'runner')],
        ];
    }
    return [
        ['brute', countFor(budget * 0.4, 'brute')],
        ['runner', countFor(budget * 0.3, 'runner')],
        ['grunt', countFor(budget * 0.3, 'grunt')],
    ];
}

/** The spawn schedule of one wave, or `null` for a wave index outside 1..3. */
export function generateWave(level: number, wave: number): readonly SpawnEntry[] | null {
    if (wave < 1 || wave > WAVES_PER_LEVEL || level < 1) return null;

    const budget = waveBudget(level, wave);
    const entries: SpawnEntry[] = [];
    let time = 0;

    for (const [type, count] of groupsFor(level, wave, budget)) {
        const gap = ENEMY_SPECS[type].spawnGap;
        for (let i = 0; i < count; i++) {
            entries.push({ time, type });
            time += gap;
        }
    }

    // Every 5th level: one boss appended to wave 3, alone, on top of the budget.
    if (wave === WAVES_PER_LEVEL && level % 5 === 0) {
        entries.push({ time: time + ENEMY_SPECS.boss.spawnGap, type: 'boss' });
    }

    return entries;
}

/** All three waves of a level, indexed `wave - 1`. */
export function generateLevelPlan(level: number): readonly (readonly SpawnEntry[])[] {
    const plan: (readonly SpawnEntry[])[] = [];
    for (let wave = 1; wave <= WAVES_PER_LEVEL; wave++) {
        plan.push(generateWave(level, wave) ?? []);
    }
    return plan;
}

/** Total threat of a schedule; the boss (added on top) is excluded when asked. */
export function scheduleThreat(entries: readonly SpawnEntry[], includeBoss = true): number {
    let total = 0;
    for (const entry of entries) {
        if (!includeBoss && entry.type === 'boss') continue;
        total += ENEMY_SPECS[entry.type].threat;
    }
    return total;
}

/** Types present in a schedule; handy for asserting composition rules. */
export function scheduleTypes(entries: readonly SpawnEntry[]): readonly EnemyType[] {
    const present = new Set<EnemyType>(entries.map((entry) => entry.type));
    return ENEMY_TYPES.filter((type) => present.has(type));
}
