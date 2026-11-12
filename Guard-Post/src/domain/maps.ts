import type { Vec2 } from './types.ts';

/**
 * The three map layouts, in world units (1 unit = 1 tile on a 9 x 12 grid).
 *
 * Every map is one road — a polyline of waypoints the enemies follow without any
 * pathfinding — plus a fixed set of build spots ("spots") at grid cell centres,
 * 1–2 tiles off the road. Level `L` plays map `(L - 1) mod 3`, so a run never
 * repeats a layout for three levels in a row.
 */

/** Grid dimensions shared by every map; the renderer scales this to the screen. */
export const GRID_WIDTH = 9;
export const GRID_HEIGHT = 12;

export interface GameMap {
    readonly name: string;
    /** Enemy path; the last point is the gate, the first is where enemies enter. */
    readonly waypoints: readonly Vec2[];
    /**
     * Fixed build spots; a tower may only stand on one of these. Every spot sits at a
     * grid cell centre, so its square pad fills exactly one cell of the field.
     */
    readonly spots: readonly Vec2[];
}

/** Map A — "S-Bend": the reference layout from the design document. */
const MAP_A: GameMap = {
    name: 'S-Bend',
    waypoints: [
        { x: 0, y: 2.5 },
        { x: 7.5, y: 2.5 },
        { x: 7.5, y: 5.5 },
        { x: 1.5, y: 5.5 },
        { x: 1.5, y: 8.5 },
        { x: 7.5, y: 8.5 },
        { x: 7.5, y: 11.5 },
    ],
    spots: [
        { x: 3.5, y: 4.5 },
        { x: 5.5, y: 4.5 },
        { x: 3.5, y: 7.5 },
        { x: 6.5, y: 7.5 },
        { x: 3.5, y: 10.5 },
        { x: 5.5, y: 10.5 },
    ],
};

/** Map B — "Staircase": enters at the top centre and steps down to a gate at the bottom. */
const MAP_B: GameMap = {
    name: 'Staircase',
    waypoints: [
        { x: 4.5, y: 0.5 },
        { x: 4.5, y: 3.5 },
        { x: 0.5, y: 3.5 },
        { x: 0.5, y: 6.5 },
        { x: 8.5, y: 6.5 },
        { x: 8.5, y: 9.5 },
        { x: 2.5, y: 9.5 },
        { x: 2.5, y: 11.5 },
    ],
    spots: [
        { x: 2.5, y: 1.5 },
        { x: 6.5, y: 1.5 },
        { x: 2.5, y: 5.5 },
        { x: 4.5, y: 5.5 },
        { x: 6.5, y: 5.5 },
        { x: 3.5, y: 8.5 },
        { x: 6.5, y: 8.5 },
        { x: 5.5, y: 11.5 },
    ],
};

/** Map C — "Coil": a long dive down the left side, then a loop back to the gate. */
const MAP_C: GameMap = {
    name: 'Coil',
    waypoints: [
        { x: 1.5, y: 0.5 },
        { x: 1.5, y: 10.5 },
        { x: 4.5, y: 10.5 },
        { x: 4.5, y: 4.5 },
        { x: 7.5, y: 4.5 },
        { x: 7.5, y: 11.5 },
    ],
    spots: [
        { x: 3.5, y: 2.5 },
        { x: 6.5, y: 3.5 },
        { x: 3.5, y: 6.5 },
        { x: 6.5, y: 7.5 },
        { x: 3.5, y: 9.5 },
        { x: 6.5, y: 10.5 },
        { x: 2.5, y: 4.5 },
    ],
};

/** All maps, in rotation order. */
export const MAPS: readonly GameMap[] = [MAP_A, MAP_B, MAP_C];

/** Level 1 plays map 0, level 2 map 1, level 3 map 2, level 4 map 0, ... */
export function mapForLevel(level: number): GameMap {
    const index = ((level - 1) % MAPS.length + MAPS.length) % MAPS.length;
    return MAPS[index];
}

// ---------------------------------------------------------------------------
// Road measurement — computed once per round so the step loop never measures
// ---------------------------------------------------------------------------

export interface Road {
    /** Length of each segment, in tiles. */
    readonly lengths: readonly number[];
    /** Total road length, in tiles. */
    readonly total: number;
}

export function measureRoad(map: GameMap): Road {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i + 1 < map.waypoints.length; i++) {
        const a = map.waypoints[i];
        const b = map.waypoints[i + 1];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        lengths.push(length);
        total += length;
    }
    return { lengths, total };
}

/**
 * The point `distance` tiles along the road, written into `out`.
 *
 * `out` is caller-owned so the simulation can position every enemy without allocating.
 * Distances beyond either end clamp to the entrance or the gate.
 */
export function pointOnRoad(map: GameMap, road: Road, distance: number, out: Vec2): Vec2 {
    let remaining = distance;
    if (remaining <= 0) {
        const first = map.waypoints[0];
        out.x = first.x;
        out.y = first.y;
        return out;
    }

    for (let i = 0; i < road.lengths.length; i++) {
        const segment = road.lengths[i];
        if (remaining <= segment) {
            const a = map.waypoints[i];
            const b = map.waypoints[i + 1];
            const t = segment === 0 ? 0 : remaining / segment;
            out.x = a.x + (b.x - a.x) * t;
            out.y = a.y + (b.y - a.y) * t;
            return out;
        }
        remaining -= segment;
    }

    const last = map.waypoints[map.waypoints.length - 1];
    out.x = last.x;
    out.y = last.y;
    return out;
}

/** Shortest distance in tiles from a point to the road centre line. */
export function distanceToRoad(map: GameMap, road: Road, point: Vec2): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < road.lengths.length; i++) {
        const a = map.waypoints[i];
        const b = map.waypoints[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        const projection = lengthSquared === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
        const t = Math.min(1, Math.max(0, projection));
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        best = Math.min(best, Math.hypot(point.x - px, point.y - py));
    }
    return best;
}
