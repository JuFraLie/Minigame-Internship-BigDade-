import { GRID_HEIGHT, GRID_WIDTH, MAPS, distanceToRoad, fitsBesideGateCastle, measureRoad, type GameMap } from './maps.ts';
import { mulberry32, seedOf } from './rng.ts';
import type { Vec2 } from './types.ts';

/**
 * Fresh layouts, one per level.
 *
 * A seeded random walk builds the road — cell by cell, never crossing itself, gently
 * pulled toward the bottom centre, and forbidden to enter the gate row until the road
 * is long enough to end there. Build pads are then scattered over every cell that sits
 * 1–2 tiles off the road and clears the gate castle's footprint.
 *
 * Everything derives from the level number, so level 7 is always the same level and no
 * two levels share a road. The rules are the ones the three reference maps obey:
 *   - road 28–36 tiles, entering on an edge, ending at a gate in the bottom row
 *     where the three-tile castle fits on the board;
 *   - 6–8 pads on cell centres, each 1–2 tiles from the road and clear of the castle.
 *
 * A failed attempt simply draws a new seed. If every attempt fails, one of the
 * reference layouts keeps the round playable — the tests prove that never happens for
 * ordinary levels.
 */

/** Road length bounds in tiles. */
const MIN_ROAD = 28;
const MAX_ROAD = 36;
/** Build spot count bounds. */
const MIN_SPOTS = 6;
const MAX_SPOTS = 8;
/** Seeded draws before falling back to a reference layout. */
const ATTEMPTS = 64;

type Cell = { readonly x: number; readonly y: number };
type Edge = 'top' | 'left' | 'right';

const EDGES: readonly Edge[] = ['top', 'left', 'right'];
const DIRECTIONS: readonly (readonly [number, number])[] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
];

/** A level's layout: deterministic, and different for every level. */
export function generateMap(level: number): GameMap {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const rng = mulberry32(seedOf(level, attempt));
        const waypoints = generateRoad(rng);
        if (!waypoints) continue;

        const stub: GameMap = { name: '', theme: 0, waypoints, spots: [] };
        const total = measureRoad(stub).total;
        if (total < MIN_ROAD || total > MAX_ROAD) continue;

        const spots = pickSpots(stub, rng);
        if (!spots) continue;

        return { name: `Level ${level}`, theme: (level - 1) % 3, waypoints, spots };
    }
    return MAPS[(((level - 1) % MAPS.length) + MAPS.length) % MAPS.length];
}

// ---------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------

/**
 * Walks the grid from a random edge to a gate cell, then returns the waypoints:
 * the entrance snapped onto the grid edge, every cell centre, collinear runs merged.
 * `null` means the walk dead-ended or overshot the length — the caller retries.
 */
function generateRoad(rng: () => number): Vec2[] | null {
    const edge = EDGES[Math.floor(rng() * EDGES.length)];
    const entrance = entranceCell(edge, rng);
    const visited = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    const cells: Cell[] = [entrance];
    visited[entrance.y * GRID_WIDTH + entrance.x] = 1;

    let current = entrance;
    let lastDx = 0;
    let lastDy = 0;

    for (;;) {
        const length = cells.length - 1;
        // 35 steps plus the half-tile from the edge keeps the total inside 28–36.
        if (length > MAX_ROAD - 1) return null;
        if (isGateCell(current) && length >= MIN_ROAD) return toWaypoints(cells, edge);

        const options: { cell: Cell; dx: number; dy: number; weight: number }[] = [];
        for (const [dx, dy] of DIRECTIONS) {
            const x = current.x + dx;
            const y = current.y + dy;
            if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
            if (visited[y * GRID_WIDTH + x]) continue;
            // The road never runs alongside itself: no neighbour of the next cell may
            // already be part of the path, except the cell we step from. This keeps
            // every road one cell wide instead of serpentine into solid blocks.
            if (touchesVisited(x, y, current, visited)) continue;
            // The gate row waits until the road is long enough; the walk ends there.
            if (y === GRID_HEIGHT - 1 && length < MIN_ROAD) continue;
            options.push({ cell: { x, y }, dx, dy, weight: weightFor(length, lastDx, lastDy, dx, dy, current) });
        }
        if (options.length === 0) return null;

        let roll = rng() * options.reduce((sum, option) => sum + option.weight, 0);
        let chosen = options[options.length - 1];
        for (const option of options) {
            roll -= option.weight;
            if (roll <= 0) {
                chosen = option;
                break;
            }
        }

        visited[chosen.cell.y * GRID_WIDTH + chosen.cell.x] = 1;
        cells.push(chosen.cell);
        current = chosen.cell;
        lastDx = chosen.dx;
        lastDy = chosen.dy;
    }
}

/** True when `(x, y)` touches any path cell other than the one stepped from. */
function touchesVisited(x: number, y: number, head: Cell, visited: Uint8Array): boolean {
    for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
        if (nx === head.x && ny === head.y) continue;
        if (visited[ny * GRID_WIDTH + nx]) return true;
    }
    return false;
}

/** Bottom-centre is where gates like to end up; the pull grows as the road lengthens. */function weightFor(length: number, lastDx: number, lastDy: number, dx: number, dy: number, from: Cell): number {
    const straight = dx === lastDx && dy === lastDy && (dx !== 0 || dy !== 0) ? 2.2 : 1;
    const pull = length < 18 ? 0.15 : 0.55;
    const goal = (cell: Cell): number => Math.abs(cell.x - 4) + Math.abs(cell.y - (GRID_HEIGHT - 1));
    const gain = goal(from) - goal({ x: from.x + dx, y: from.y + dy });
    return straight * Math.min(4, Math.max(0.35, 1 + pull * gain));
}

/** The gate sits in the bottom row, inset so the three-tile castle fits on the board. */
function isGateCell(cell: Cell): boolean {
    return cell.y === GRID_HEIGHT - 1 && cell.x >= 1 && cell.x <= GRID_WIDTH - 2;
}

function entranceCell(edge: Edge, rng: () => number): Cell {
    if (edge === 'top') return { x: Math.floor(rng() * GRID_WIDTH), y: 0 };
    // Side entrances never start on the gate row, so gate and entrance stay apart.
    const y = Math.floor(rng() * (GRID_HEIGHT - 1));
    return { x: edge === 'left' ? 0 : GRID_WIDTH - 1, y };
}

/** Cell centres plus the entrance point on the edge, with straight runs merged. */
function toWaypoints(cells: readonly Cell[], edge: Edge): Vec2[] {
    const first = cells[0];
    const entry: Vec2 =
        edge === 'top'
            ? { x: first.x + 0.5, y: 0 }
            : edge === 'left'
              ? { x: 0, y: first.y + 0.5 }
              : { x: GRID_WIDTH, y: first.y + 0.5 };
    return compress([entry, ...cells.map((cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 }))]);
}

/** Drops a point when the segment before and after it share a direction. */
function compress(points: readonly Vec2[]): Vec2[] {
    if (points.length < 3) return [...points];
    const out: Vec2[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = out[out.length - 1];
        const cur = points[i];
        const next = points[i + 1];
        const ax = cur.x - prev.x;
        const ay = cur.y - prev.y;
        const bx = next.x - cur.x;
        const by = next.y - cur.y;
        const collinear = ax * by - ay * bx === 0 && ax * bx + ay * by > 0;
        if (!collinear) out.push(cur);
    }
    out.push(points[points.length - 1]);
    return out;
}

// ---------------------------------------------------------------------------
// The build spots
// ---------------------------------------------------------------------------

/** Every eligible cell — 1–2 tiles off the road, clear of the castle — shuffled. */
function pickSpots(map: GameMap, rng: () => number): Vec2[] | null {
    const gate = map.waypoints[map.waypoints.length - 1];
    const road = measureRoad(map);
    const candidates: Cell[] = [];

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const center = { x: x + 0.5, y: y + 0.5 };
            const distance = distanceToRoad(map, road, center);
            if (distance < 1 - 1e-6 || distance > 2 + 1e-6) continue;
            if (!fitsBesideGateCastle(center, gate)) continue;
            candidates.push({ x, y });
        }
    }
    if (candidates.length < MIN_SPOTS) return null;

    // Seeded Fisher–Yates; the first `count` cells become pads.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const swap = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = swap;
    }
    const count = Math.min(candidates.length, MIN_SPOTS + Math.floor(rng() * (MAX_SPOTS - MIN_SPOTS + 1)));
    return candidates.slice(0, count).map((cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 }));
}
