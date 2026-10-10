/**
 * Pure gameplay configuration: field geometry, monster rules and difficulty tuning.
 *
 * Nothing in this file knows about Phaser, the DOM or the screen. The renderer maps the
 * logical field onto whatever the device gives us, and the input adapter converts screen
 * hits back into these coordinates, so the simulation below stays resolution independent
 * and runnable headless (AGENTS.md §4.3).
 */

/** Logical width of the play field, in field units. */
export const FIELD_WIDTH = 450;

/** Logical height of the play field, in field units. */
export const FIELD_HEIGHT = 800;

export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const HOLE_COUNT = GRID_COLS * GRID_ROWS;

/** Radius of a hole; monsters and hit tests are sized from it. */
export const HOLE_RADIUS = 46;

/** Horizontal hole positions, as a ratio of the field width (symmetric margins). */
const HOLE_X_RATIOS = [0.2, 0.5, 0.8];

/** Vertical hole positions, in field units. Chosen so top and bottom margins match. */
const HOLE_Y_POSITIONS = [203, 403, 603];

export interface FieldPoint {
    x: number;
    y: number;
}

/** Position of a hole in field coordinates. `hole` is the slot index, row-major. */
export function holePosition(hole: number): FieldPoint {
    const column = hole % GRID_COLS;
    const row = Math.floor(hole / GRID_COLS);
    return {
        x: HOLE_X_RATIOS[column] * FIELD_WIDTH,
        y: HOLE_Y_POSITIONS[row],
    };
}

export const MAX_LIVES = 3;

export type MonsterKind = 'normal' | 'armored' | 'ninja';

export interface MonsterRules {
    /** Base points awarded when the monster is defeated. */
    readonly points: number;
    /** How many taps defeat it (ninja ignores taps entirely). */
    readonly requiredHits: number;
    /** Only a swipe can defeat it; taps are deflected. */
    readonly requiresSwipe: boolean;
    /** How long it stays up before escaping, in milliseconds, at base difficulty. */
    readonly stayMs: number;
}

export const MONSTER_RULES: Record<MonsterKind, MonsterRules> = {
    normal: { points: 100, requiredHits: 1, requiresSwipe: false, stayMs: 1300 },
    armored: { points: 200, requiredHits: 2, requiresSwipe: false, stayMs: 1500 },
    ninja: { points: 300, requiredHits: 1, requiresSwipe: true, stayMs: 1200 },
};

/** A monster can never stay up for less than this, however fast the game gets. */
export const MIN_STAY_MS = 650;

export interface DifficultyTuning {
    /**
     * Head start charged to the round clock at reset, so the first monster of a round
     * arrives earlier than one full interval would take.
     */
    readonly firstSpawnDelayMs: number;
    readonly baseIntervalMs: number;
    readonly minIntervalMs: number;
    readonly intervalDecayMsPerKill: number;
    readonly speedGainPerKill: number;
    readonly maxSpeedMultiplier: number;
    readonly doubleSpawnSpeedThreshold: number;
    readonly doubleSpawnChance: number;
    /** Above this random roll the spawn is a ninja, above `armoredRollCeiling` an armored one. */
    readonly ninjaRollCeiling: number;
    readonly armoredRollCeiling: number;
}

export const DIFFICULTY: DifficultyTuning = {
    firstSpawnDelayMs: 400,
    baseIntervalMs: 1200,
    minIntervalMs: 550,
    intervalDecayMsPerKill: 18,
    speedGainPerKill: 0.04,
    maxSpeedMultiplier: 3.5,
    doubleSpawnSpeedThreshold: 1.4,
    doubleSpawnChance: 0.35,
    ninjaRollCeiling: 0.75,
    armoredRollCeiling: 0.45,
};

/** Score multiplier: +0.5 per full combo step, capped at +3. */
export const COMBO_STEP = 4;
export const COMBO_STEP_BONUS = 0.5;
export const MAX_COMBO_BONUS = 3;

/** Animation rates, in units per second (rise is a 0..1 fraction of the emergence distance). */
export const EMERGE_RATE = 5.0;
export const RETREAT_RATE = 4.5;
export const WHACKED_SINK_RATE = 6.0;
export const HIT_FLASH_RATE = 4.0;
export const DODGE_RATE = 3.0;

/** How far a monster rises above its hole at full emergence, as a multiple of the radius. */
export const RISE_DISTANCE_RATIO = 1.15;

/**
 * Hit reach around the monster centre, as a multiple of the radius.
 *
 * The creature art is 130x140 and `WorldView` draws it at field scale, so a risen monster
 * reaches 65 field units sideways and 70 up and down from its centre; `HOLE_RADIUS *
 * HIT_RADIUS_RATIO` is 46 x 1.55 = 71.3, which covers that. A reach shorter than the
 * creature leaves an outer ring of it drawn but hittable in no way: a slash laid plainly
 * across a wolf's head connects with nothing and the monster does not react at all — which
 * is what "swiping does nothing" looked like on the phone. Taps never exposed it, because
 * a tap is aimed at the centre.
 */
export const HIT_RADIUS_RATIO = 1.55;

/** Horizontal shake distance when a tap is deflected, in field units. */
export const DODGE_DISTANCE = 14;
