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

/** The bus, which is painted in its own slate rather than in one of the car colours. */
export const BUS_COLOR = 0x34495e;

/**
 * Paint palette, indexed by `color` on every car.
 *
 * Five colours, one per body the bundled art pack ships in, so every car is drawn from
 * real art rather than from the procedural fallback. `render/carTextures.ts` pairs these
 * with the pack's colour names by position, so a colour added here has to be added there
 * too or it quietly loses its art.
 */
export const CAR_COLORS: readonly number[] = [
    0xe74c3c, // red
    0x3498db, // blue
    0xf1c40f, // yellow
    0x2ecc71, // green
    0x2b2f36, // black
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
 *
 * Every band parks cars at exactly TWO cells. The bands used to hand out one, two and
 * three, which put vehicles of visibly different sizes side by side on the same board: a
 * one-cell car filled 0.40 of a lane's width where a two-cell car filled 0.88, so the
 * short one read as broken rather than as a deliberate smaller vehicle.
 *
 * Two is also the longest length that every band can still fill. The tightest is ten cars
 * on a 5x6 lot, and three-cell cars there would claim thirty of thirty cells before any
 * of them had a clear corridor to drive out through, so the car-count band would collapse.
 * Mean demand is unchanged — the old band averaged two cells a car anyway — so the later
 * levels are no fuller than they were.
 *
 * The five-cell bus is unaffected: it joins the ring rather than the lot, so it is a ring
 * event with its own speed and art, not one of the parked cars.
 */
export function levelSpec(level: number): LevelSpec {
    if (level <= 3) {
        return { cols: 4, rows: 4, minCars: 4, maxCars: 6, minLength: 2, maxLength: 2, ringSpeed: 2.5, speedPulse: false, bus: false };
    }
    if (level <= 8) {
        return { cols: 5, rows: 5, minCars: 8, maxCars: 10, minLength: 2, maxLength: 2, ringSpeed: 3, speedPulse: false, bus: false };
    }
    if (level <= 15) {
        return { cols: 5, rows: 6, minCars: 10, maxCars: 14, minLength: 2, maxLength: 2, ringSpeed: 3.5, speedPulse: true, bus: false };
    }
    return { cols: 6, rows: 7, minCars: 14, maxCars: 18, minLength: 2, maxLength: 2, ringSpeed: 4, speedPulse: true, bus: true };
}
