/**
 * Tuning constants and level progression — the single source of truth for the numbers.
 *
 * Pure data: nothing here imports anything, so the domain, the tests and the renderer can
 * all read the same table without a circular dependency.
 */

/** Fenders (lives) per round. */
export const LIVES = 3;

/** Domain tick length. The simulation only ever advances in whole ticks. */
export const TICK_SECONDS = 1 / 60;

/** Two successful releases closer together than this keep the combo alive. */
export const COMBO_WINDOW_SECONDS = 4;

/** The combo multiplier climbs from x1 to this cap. */
export const MAX_MULTIPLIER = 5;

/** Points for one car that joined the ring, before the multiplier. */
export const CAR_POINTS = 100;

/** Points for joining the ring with a circling car 1-2 cells away. */
export const NEAR_MISS_POINTS = 50;

/** Flat bonus for clearing the whole lot. */
export const CLEAR_BONUS_POINTS = 200;

/** Bonus per fender still standing when the lot is cleared. */
export const LIFE_BONUS_POINTS = 100;

/** Ceiling of the time bonus paid on a clear. */
export const SPEED_BONUS_MAX_POINTS = 300;

/** Par for the time bonus: this many seconds per car in the lot. */
export const SPEED_BONUS_PAR_SECONDS_PER_CAR = 6;

/**
 * Smallest entry window, in ring cells, no matter how short the car is: a car may join
 * only when the entry cell and the cell just upstream of it are both free.
 */
export const ENTRY_WINDOW_MIN_CELLS = 2;

/** Cars ride this far behind the vehicle in front of them instead of overlapping it. */
export const QUEUE_GAP_CELLS = 0.1;

/** The bus is longer than any car and takes more ring cells. */
export const BUS_LENGTH = 5;

/** The bus moves at this fraction of the ring speed — it is what clogs the ring. */
export const BUS_SPEED_RATIO = 0.55;

/** Ring speed swing for the pulsing levels. */
export const PULSE_AMPLITUDE = 0.25;
export const PULSE_PERIOD_SECONDS = 6;

/** How long a blocked car keeps showing its lock icon and shaking. */
export const SHAKE_SECONDS = 0.5;

/** Paint palette, indexed by `color` on every car. */
export const CAR_COLORS: readonly number[] = [
    0xe74c3c, // red
    0x3498db, // blue
    0xf1c40f, // yellow
    0x2ecc71, // green
    0xe67e22, // orange
    0x9b59b6, // purple
    0x1abc9c, // teal
    0xfd79a8, // pink
];

export interface LevelSpec {
    readonly cols: number;
    readonly rows: number;
    readonly minCars: number;
    readonly maxCars: number;
    readonly minLength: number;
    readonly maxLength: number;
    /** Ring speed in cells per second. */
    readonly ringSpeed: number;
    /** Whether the ring speed breathes up and down. */
    readonly speedPulse: boolean;
    /** Whether the slow bus joins the ring. */
    readonly bus: boolean;
}

/**
 * Level table. Levels past the last band keep the last band's shape and just get a new
 * layout, so "level 40" is always playable without a hand-written level 40.
 */
export function levelSpec(level: number): LevelSpec {
    if (level <= 3) {
        return { cols: 4, rows: 4, minCars: 4, maxCars: 6, minLength: 2, maxLength: 2, ringSpeed: 2.5, speedPulse: false, bus: false };
    }
    if (level <= 8) {
        return { cols: 5, rows: 5, minCars: 8, maxCars: 10, minLength: 1, maxLength: 3, ringSpeed: 3, speedPulse: false, bus: false };
    }
    if (level <= 15) {
        return { cols: 5, rows: 6, minCars: 10, maxCars: 14, minLength: 1, maxLength: 3, ringSpeed: 3.5, speedPulse: true, bus: false };
    }
    return { cols: 6, rows: 7, minCars: 14, maxCars: 18, minLength: 1, maxLength: 3, ringSpeed: 4, speedPulse: true, bus: true };
}
