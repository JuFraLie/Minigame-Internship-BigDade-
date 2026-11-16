/**
 * Map definitions, in world units (1 unit = 1 tile on a `width` x `height` grid).
 *
 * This is the vocabulary the whole map pipeline speaks: the generator produces a
 * `MapDefinition`, the simulation asks a `MapSource` for one, and the adapters decide
 * where definitions come from. Nothing here knows about Phaser, the DOM or `window`.
 */

/** A plain point in world units. Structurally identical to the domain's `Vec2`. */
export interface Point {
    readonly x: number;
    readonly y: number;
}

/** A build spot: an id (`"s0"`, `"s1"`, ...) plus the pad's centre in world units. */
export interface Spot {
    readonly id: string;
    readonly x: number;
    readonly y: number;
}

/** One grid cell of the road, in cell coordinates (0-based, top-left is `0,0`). */
export interface Cell {
    readonly x: number;
    readonly y: number;
}

/**
 * One layout: the road as corner points, the road's tile count, and the build spots.
 *
 * `waypoints` holds corner points only — every interior point sits at a tile centre
 * (`tile + 0.5`). The first point is the entrance (half a tile outside the left edge),
 * the last point is the gate on the bottom edge.
 */
export interface MapDefinition {
    /** The seed this layout was generated from (0 for hand-authored maps). */
    readonly seed: number;
    readonly width: number;
    readonly height: number;
    readonly waypoints: readonly Point[];
    /** Number of tiles the road covers, entrance and gate included. */
    readonly pathLength: number;
    readonly spots: readonly Spot[];
}

/**
 * Inputs to `generateMap`. Everything but the seed has a documented default
 * (`DEFAULT_MAP_PARAMS`); the generator's output depends on these values alone.
 */
export interface MapParams {
    readonly seed: number;
    /** Grid width in tiles. */
    readonly width: number;
    /** Grid height in tiles. */
    readonly height: number;
    /** Shortest road the walk may finish with, in tiles. */
    readonly minLength: number;
    /** Longest road the walk may finish with, in tiles. */
    readonly maxLength: number;
    /** Fewest direction changes a finished walk must have. */
    readonly minTurns: number;
    /** Most direction changes a finished walk may have. */
    readonly maxTurns: number;
    /** Build spots every map must place (6–8). */
    readonly spotCount: number;
    /** Tower range in tiles; every road tile must sit within it of a spot. */
    readonly towerRange: number;
}

/** The default parameters: a 9 x 12 board, 28–36 tiles, 4–8 turns, 8 spots, range 2.2. */
export const DEFAULT_MAP_PARAMS: Readonly<MapParams> = {
    seed: 0,
    width: 9,
    height: 12,
    minLength: 28,
    maxLength: 36,
    minTurns: 4,
    maxTurns: 8,
    spotCount: 8,
    towerRange: 2.2,
};

/**
 * Where a level's layout comes from — the port the simulation depends on.
 *
 * The simulation never learns how a map is made: the composition root wires in a
 * `ProceduralMapSource` for the running game and a `FixedMapSource` for hand-authored
 * fixtures, and tests may hand in anything else that answers `getMap`.
 */
export interface MapSource {
    getMap(level: number): MapDefinition;
}
