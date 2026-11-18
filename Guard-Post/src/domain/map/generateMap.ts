import { GRID_HEIGHT, GRID_WIDTH, type GameMap } from '../maps.ts';
import { attemptSeed, mulberry32 } from './prng.ts';
import { walkRoad } from './roadWalk.ts';
import { placeSpots } from './spotPlacement.ts';
import { roadCells, validateMap } from './validate.ts';
import type { Cell, MapDefinition, MapParams, Point } from './types.ts';

/**
 * Deterministic map generation: `generateMap(params)` and nothing else.
 *
 * Each attempt derives its own seed from the map seed and the attempt number, walks a
 * one-tile-wide road from the left edge to a gate in the last row, places the build
 * spots, and validates the result against every rule in `validate.ts`. The first
 * attempt that validates wins; after 40 attempts the hand-authored fallback keeps the
 * round playable. The function never throws and never loops forever — its output
 * depends only on `params`, with no clock, no `Math.random` and no global state.
 */

/** Seeded draws before falling back to the hand-authored layout. */
const ATTEMPTS = 40;

/**
 * Spot placements per road: the greedy breaks its ties with the PRNG, so a fresh
 * stream re-shuffles the late picks — the rounds that strand the last one or two road
 * tiles — before the road itself is discarded and a new walk is drawn.
 */
const PLACEMENT_TRIES = 10;

/** Generates one layout from its parameters; the same params always give the same map. */
export function generateMap(params: MapParams): MapDefinition {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const rng = mulberry32(attemptSeed(params.seed, attempt));
        const cells = walkRoad(params, rng);
        if (!cells) continue;

        const waypoints = cellsToWaypoints(cells, params.height);
        const gate = waypoints[waypoints.length - 1];
        for (let placement = 0; placement < PLACEMENT_TRIES; placement++) {
            const spots = placeSpots(params, cells, gate, rng);
            if (!spots) break; // The candidate set itself is too small; a new walk is needed.

            const definition: MapDefinition = {
                seed: params.seed,
                width: params.width,
                height: params.height,
                waypoints,
                pathLength: cells.length,
                spots,
            };
            if (validateMap(definition, params).length === 0) return definition;
        }
    }
    return FALLBACK_MAP;
}

/**
 * The escape hatch when no attempt validates: a frozen layout that itself obeys
 * every rule in `validate.ts` under its own spot count, so the round stays playable
 * and every road tile but the gate stays within the shortest level-1 tower range
 * even when the parameters make a generated road impossible. Six pads hugging the
 * road within 1.5 tiles (the pad at (4.5, 11.5) tucks beside the gate castle),
 * gate two tiles inset, entrance one grid wide.
 */
export const FALLBACK_MAP: MapDefinition = {
    seed: 5,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    pathLength: 28,
    waypoints: [
        { x: -0.5, y: 4.5 },
        { x: 2.5, y: 4.5 },
        { x: 2.5, y: 7.5 },
        { x: 1.5, y: 7.5 },
        { x: 1.5, y: 10.5 },
        { x: 4.5, y: 10.5 },
        { x: 4.5, y: 4.5 },
        { x: 6.5, y: 4.5 },
        { x: 6.5, y: 12 },
    ],
    spots: [
        { id: 's0', x: 2.5, y: 9.5 },
        { id: 's1', x: 5.5, y: 5.5 },
        { id: 's2', x: 1.5, y: 5.5 },
        { id: 's3', x: 5.5, y: 8.5 },
        { id: 's4', x: 4.5, y: 11.5 },
        { id: 's5', x: 7.5, y: 9.5 },
    ],
};

/** A hand-authored reference layout as a `MapDefinition` (seed identifies it). */
export function defineMap(map: GameMap, seed: number): MapDefinition {
    return {
        seed,
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        waypoints: map.waypoints.map((point) => ({ x: point.x, y: point.y })),
        pathLength: roadCells(map.waypoints, GRID_WIDTH, GRID_HEIGHT).length,
        spots: map.spots.map((spot, index) => ({ id: `s${index}`, x: spot.x, y: spot.y })),
    };
}

/**
 * The road's corner points: the entrance half a tile outside the left edge, every
 * cell centre, and the gate on the bottom edge — with straight runs merged, so the
 * renderer sees corners only.
 */
function cellsToWaypoints(cells: readonly Cell[], height: number): Point[] {
    const first = cells[0];
    const last = cells[cells.length - 1];
    const points: Point[] = [
        { x: -0.5, y: first.y + 0.5 },
        ...cells.map((cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 })),
        { x: last.x + 0.5, y: height },
    ];
    return compress(points);
}

/** Drops a point when the segment before and after it share a direction. */
function compress(points: readonly Point[]): Point[] {
    if (points.length < 3) return [...points];
    const out: Point[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const previous = out[out.length - 1];
        const current = points[i];
        const next = points[i + 1];
        const ax = current.x - previous.x;
        const ay = current.y - previous.y;
        const bx = next.x - current.x;
        const by = next.y - current.y;
        const collinear = ax * by - ay * bx === 0 && ax * bx + ay * by > 0;
        if (!collinear) out.push(current);
    }
    out.push(points[points.length - 1]);
    return out;
}
