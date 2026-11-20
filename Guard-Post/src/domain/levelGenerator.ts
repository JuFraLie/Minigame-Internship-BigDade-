import { ENEMY_SPECS, ENEMY_TYPES, wavesForLevel, type EnemyType } from './types.ts';
import { mulberry32, seedOf } from './rng.ts';

/**
 * Seeded wave generation from a threat budget.
 *
 * No wave is hand-written: `generateWave(level, wave)` draws its composition from a
 * seed derived from the level, so the same level always plays out the same way —
 * which is what makes the whole game testable by a bot and reproducible in a unit
 * test — while different levels field different mixes of enemies.
 *
 * Budget for wave `w` of a level with `N` waves (3..10):
 *     (8 + 2.5 x (L - 1)) x (1 + 0.7 x (w - 1) / (N - 1))
 * so each level ramps from its opening wave to a fixed 1.7x finish, however many
 * waves it has. The early 3-wave levels keep exactly their old budgets.
 * Unlocks by level:
 *     grunts always, runners from level 2, brutes from level 3.
 * Composition by wave:
 *     wave 1  one unlocked type at random
 *     wave 2  two unlocked types at random
 *     wave 3+ every unlocked type, in random shares of the budget
 * Shares are random per level but always spend at least half the budget and never
 * exceed it. Every 5th level appends one boss to its last wave, on top of the budget.
 */

export interface SpawnEntry {
    /** Seconds after the wave starts. */
    readonly time: number;
    readonly type: EnemyType;
}

type Group = readonly [EnemyType, number];

/** Threat budget for one wave of one level, scaled across that level's wave count. */
export function waveBudget(level: number, wave: number): number {
    const count = wavesForLevel(level);
    const progress = (wave - 1) / Math.max(1, count - 1);
    return (8 + 2.5 * (level - 1)) * (1 + 0.7 * progress);
}

/** Enemy types unlocked at `level`: grunts always, runners from 2, brutes from 3. */
function unlockedFor(level: number): readonly EnemyType[] {
    const types: EnemyType[] = ['grunt'];
    if (level >= 2) types.push('runner');
    if (level >= 3) types.push('brute');
    return types;
}

/** How many different types a wave fields: wave 1 singles, wave 2 pairs, wave 3+ all. */
function typesInWave(level: number, wave: number): number {
    const available = unlockedFor(level);
    if (wave === 1) return 1;
    if (wave === 2) return Math.min(2, available.length);
    return available.length;
}

/** The enemy groups of a wave, in spawn order, as [type, count] pairs. */
function groupsFor(level: number, wave: number, budget: number, rng: () => number): readonly Group[] {
    const available = [...unlockedFor(level)];
    const chosen: EnemyType[] = [];
    for (let i = 0; i < typesInWave(level, wave) && available.length > 0; i++) {
        chosen.push(available.splice(Math.floor(rng() * available.length), 1)[0]);
    }

    // Random shares: every chosen type weighs 0.4..1.4 of the budget, by threat.
    const weights = chosen.map(() => 0.4 + rng());
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const counts = new Map<EnemyType, number>();
    let spent = 0;
    chosen.forEach((type, index) => {
        const share = (weights[index] / weightTotal) * budget;
        const count = Math.floor(share / ENEMY_SPECS[type].threat);
        if (count > 0) {
            counts.set(type, count);
            spent += count * ENEMY_SPECS[type].threat;
        }
    });

    // Never underspend half the budget: top up with the cheapest unlocked type,
    // grunts first, until the floor is reached or the budget is full.
    const topUpOrder: EnemyType[] = ['grunt', ...unlockedFor(level).filter((type) => type !== 'grunt')];
    while (spent < budget * 0.5) {
        const type = topUpOrder.find((candidate) => spent + ENEMY_SPECS[candidate].threat <= budget);
        if (!type) break;
        counts.set(type, (counts.get(type) ?? 0) + 1);
        spent += ENEMY_SPECS[type].threat;
    }

    // Shuffle the blocks: sometimes the heavy group walks in first, sometimes last.
    const groups: Group[] = [...counts].map(([type, count]) => [type, count]);
    for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const swap = groups[i];
        groups[i] = groups[j];
        groups[j] = swap;
    }
    return groups;
}

/** The spawn schedule of one wave, or `null` for a wave index outside this level's ramp. */
export function generateWave(level: number, wave: number): readonly SpawnEntry[] | null {
    if (wave < 1 || wave > wavesForLevel(level) || level < 1) return null;

    const rng = mulberry32(seedOf(level, wave));
    const budget = waveBudget(level, wave);
    const entries: SpawnEntry[] = [];
    let time = 0;

    for (const [type, count] of groupsFor(level, wave, budget, rng)) {
        const gap = ENEMY_SPECS[type].spawnGap;
        for (let i = 0; i < count; i++) {
            entries.push({ time, type });
            time += gap;
        }
    }

    // Every 5th level: one boss appended to its last wave, alone, on top of the budget.
    if (wave === wavesForLevel(level) && level % 5 === 0) {
        entries.push({ time: time + ENEMY_SPECS.boss.spawnGap, type: 'boss' });
    }

    return entries;
}

/** Every wave of a level, indexed `wave - 1`. */
export function generateLevelPlan(level: number): readonly (readonly SpawnEntry[])[] {
    const plan: (readonly SpawnEntry[])[] = [];
    const count = wavesForLevel(level);
    for (let wave = 1; wave <= count; wave++) {
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
