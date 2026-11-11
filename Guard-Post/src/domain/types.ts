/**
 * Shared vocabulary of the game world.
 *
 * Everything in `src/domain/` speaks through the constants, commands, snapshots and
 * events declared here, and nothing here knows that a renderer, a viewport or a `window`
 * exists. Coordinates are world units: 1 unit = 1 tile on a 9 x 12 grid.
 */

/** A point in world units (1 unit = 1 tile). */
export interface Vec2 {
    x: number;
    y: number;
}

/** Simulation rate. The whole game advances in fixed steps of this size. */
export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;

/** Waves per level; the level is cleared when the last one is empty. */
export const WAVES_PER_LEVEL = 3;
/** Lives at the start of every level. */
export const STARTING_LIVES = 10;
/** Seconds between waves when the player does not call the next one early. */
export const WAVE_GAP_SECONDS = 8;
/** Seconds wave 1 waits before starting on its own if the player never acts. */
export const GRACE_SECONDS = 10;

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------

export const TOWER_TYPES = ['dart', 'cannon', 'frost'] as const;
export type TowerType = (typeof TOWER_TYPES)[number];

export interface TowerSpec {
    /** Base gold cost. */
    readonly cost: number;
    readonly damage: number;
    /** Shots per second at level 1. */
    readonly fireRate: number;
    /** Range in tiles. */
    readonly range: number;
    /** Splash radius in tiles; 0 means a single target. */
    readonly splash: number;
    /** Fraction of the target's armor ignored, 0..1. */
    readonly armorPierce: number;
    /** Slow strength applied on hit, 0..1; 0 means no slow. */
    readonly slow: number;
    /** Slow duration in seconds. */
    readonly slowSeconds: number;
}

export const TOWER_SPECS: Record<TowerType, TowerSpec> = {
    dart: { cost: 40, damage: 6, fireRate: 3.0, range: 2.2, splash: 0, armorPierce: 0, slow: 0, slowSeconds: 0 },
    cannon: { cost: 70, damage: 28, fireRate: 0.7, range: 2.6, splash: 0.9, armorPierce: 0.5, slow: 0, slowSeconds: 0 },
    frost: { cost: 50, damage: 2, fireRate: 1.5, range: 2.0, splash: 0, armorPierce: 0, slow: 0.4, slowSeconds: 1.5 },
};

/** Highest purchasable tower level. */
export const MAX_TOWER_LEVEL = 3;
/** Damage multiplier by level (level 1 is the base). */
export const UPGRADE_DAMAGE_FACTOR = [1, 1.4, 1.9] as const;
/** Flat range bonus in tiles by level. */
export const UPGRADE_RANGE_BONUS = [0, 0.2, 0.4] as const;
/** Frost slow strength by level: 40%, 50%, 60%. */
export const FROST_SLOW_BY_LEVEL = [0.4, 0.5, 0.6] as const;
/** Cost of buying level `n`, as a multiple of the base cost. */
export const UPGRADE_COST_FACTOR = [0, 0.8, 1.2] as const;
/** Share of everything spent on a tower that selling returns. */
export const SELL_REFUND_RATE = 0.7;

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export const ENEMY_TYPES = ['grunt', 'runner', 'brute', 'boss'] as const;
export type EnemyType = (typeof ENEMY_TYPES)[number];

export interface EnemySpec {
    /** Base hit points at level 1; scaled by `HP_GROWTH_PER_LEVEL ^ (level - 1)`. */
    readonly hp: number;
    /** Tiles per second. */
    readonly speed: number;
    readonly armor: number;
    /** Gold dropped on death, before the level multiplier. */
    readonly reward: number;
    /** Lives lost when this enemy reaches the gate. */
    readonly leak: number;
    /** Cost of one enemy in the wave budget. */
    readonly threat: number;
    /** Seconds between two spawns of this type inside a wave. */
    readonly spawnGap: number;
}

export const ENEMY_SPECS: Record<EnemyType, EnemySpec> = {
    grunt: { hp: 30, speed: 1.0, armor: 0, reward: 5, leak: 1, threat: 1, spawnGap: 1.0 },
    runner: { hp: 18, speed: 1.8, armor: 0, reward: 4, leak: 1, threat: 1.5, spawnGap: 0.6 },
    brute: { hp: 120, speed: 0.6, armor: 40, reward: 14, leak: 3, threat: 6, spawnGap: 2.0 },
    boss: { hp: 600, speed: 0.5, armor: 60, reward: 60, leak: 5, threat: 6, spawnGap: 3.0 },
};

/** Enemy hit points multiply by this for every level above 1. */
export const HP_GROWTH_PER_LEVEL = 1.1;
/** Bosses shrug off this share of every slow effect. */
export const BOSS_SLOW_RESISTANCE = 0.5;

// ---------------------------------------------------------------------------
// Commands — world coordinates and ids only, never pixels
// ---------------------------------------------------------------------------

export type GameCommand =
    | { readonly kind: 'build'; readonly spotId: number; readonly tower: TowerType }
    | { readonly kind: 'upgrade'; readonly towerId: number }
    | { readonly kind: 'sell'; readonly towerId: number }
    | { readonly kind: 'callWave' };

/** Why a command was refused; the renderer turns this into player feedback. */
export type BlockReason = 'gold' | 'occupied' | 'noSpot' | 'noTower' | 'maxLevel' | 'noWave';

// ---------------------------------------------------------------------------
// Events — one-shot things that happened during a step
// ---------------------------------------------------------------------------

export type RoundEvent =
    | { readonly type: 'shot'; readonly towerId: number; readonly tower: TowerType; readonly x: number; readonly y: number }
    | { readonly type: 'hit'; readonly x: number; readonly y: number; readonly damage: number }
    | {
          readonly type: 'kill';
          readonly enemyId: number;
          readonly enemy: EnemyType;
          readonly x: number;
          readonly y: number;
          readonly reward: number;
          readonly score: number;
      }
    | { readonly type: 'leak'; readonly enemyId: number; readonly enemy: EnemyType; readonly lives: number }
    | { readonly type: 'waveStarted'; readonly wave: number }
    | { readonly type: 'waveCleared'; readonly wave: number; readonly bonus: number; readonly score: number }
    | { readonly type: 'levelCleared'; readonly score: number; readonly lives: number }
    | { readonly type: 'defeat'; readonly score: number }
    | { readonly type: 'built'; readonly spotId: number; readonly towerId: number; readonly tower: TowerType; readonly gold: number }
    | { readonly type: 'upgraded'; readonly towerId: number; readonly level: number; readonly gold: number }
    | { readonly type: 'sold'; readonly towerId: number; readonly refund: number; readonly gold: number }
    | { readonly type: 'blocked'; readonly reason: BlockReason };

// ---------------------------------------------------------------------------
// Snapshots — what the renderer is allowed to see
// ---------------------------------------------------------------------------

export type RoundPhase = 'playing' | 'won' | 'lost';

/**
 * Where the round is between waves:
 * `grace` before wave 1, `active` while a wave is spawning or fighting,
 * `gap` while the timer runs before the next wave, `done` after wave 3.
 */
export type WaveState = 'grace' | 'active' | 'gap' | 'done';

/** The slow hanging on an enemy, as the renderer sees it. */
export interface SlowView {
    readonly strength: number;
    readonly seconds: number;
}

export interface EnemyView {
    readonly id: number;
    readonly type: EnemyType;
    readonly x: number;
    readonly y: number;
    /** Position one step ago, so the renderer can interpolate. */
    readonly prevX: number;
    readonly prevY: number;
    readonly hp: number;
    readonly maxHp: number;
    /** Current slow, for display: strength 0..1 and the seconds left on it. */
    readonly slow: SlowView;
    /** Tiles travelled along the road; decides "First" targeting. */
    readonly progress: number;
}

export interface TowerView {
    readonly id: number;
    readonly spotId: number;
    readonly type: TowerType;
    readonly level: number;
    readonly x: number;
    readonly y: number;
    readonly range: number;
    /** Damage per shot after upgrades; the menu shows what the tower has become. */
    readonly damage: number;
    /** Seconds until the next shot; 0 means ready. */
    readonly cooldown: number;
    /** Total gold spent on this tower; drives the sell refund. */
    readonly spent: number;
}

export interface ProjectileView {
    /** Pooled slots stay allocated; skip the inactive ones when drawing. */
    readonly active: boolean;
    readonly x: number;
    readonly y: number;
    readonly prevX: number;
    readonly prevY: number;
    readonly tower: TowerType;
}

/**
 * The whole round, as one object.
 *
 * The `enemies`, `towers` and `projectsiles` arrays are live: they are mutated in place
 * and reused between steps so the hot path never allocates. A snapshot is therefore only
 * valid until the next `step()` — copy anything that must outlive it.
 */
export interface RoundSnapshot {
    readonly level: number;
    readonly mapIndex: number;
    readonly phase: RoundPhase;
    readonly lives: number;
    readonly gold: number;
    readonly score: number;
    /** 1..3. */
    readonly wave: number;
    readonly waveState: WaveState;
    /** Seconds left in the grace period or wave gap, 0 otherwise. */
    readonly pendingSeconds: number;
    /** Spawn entries of the current wave not yet emitted. */
    readonly spawnsLeft: number;
    readonly enemies: readonly EnemyView[];
    readonly towers: readonly TowerView[];
    readonly projectiles: readonly ProjectileView[];
}
