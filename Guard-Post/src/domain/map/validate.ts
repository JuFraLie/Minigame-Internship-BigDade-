import { fitsBesideGateCastle } from '../maps.ts';
import type { Cell, MapDefinition, MapParams, Point } from './types.ts';

/**
 * The map rules, checked mechanically: every condition a generated layout must hold.
 *
 * `validateMap` returns the list of violations — empty means the map is legal. The
 * generator calls it before accepting an attempt, and the property tests call it over
 * a thousand seeds, so a rule that silently stops holding fails the build.
 *
 * The rules:
 *   - the road stays in bounds, never repeats a tile and never runs alongside itself;
 *   - it starts in column 0 (the left edge) and ends on an inset tile of the last row,
 *     with `pathLength` tiles and a turn count inside the given range;
 *   - every segment is axis-aligned, so enemies never cut a corner;
 *   - spots sit at grid cell centres, off the road, 1–2 tiles from the nearest road
 *     tile, at least 1.5 tiles apart, clear of the gate castle, with ids `s0..sn-1`;
 *   - every road tile lies within `towerRange` of at least one spot, so a tower built
 *     anywhere covers real road.
 */

/** Epsilon for authored decimals; the grid arithmetic itself is exact. */
const EPSILON = 1e-6;

/** All violations of the map rules for `map`, empty when the map is legal. */
export function validateMap(map: MapDefinition, params: MapParams): string[] {
    const problems: string[] = [];

    if (params.minLength > params.maxLength) problems.push('params: minLength exceeds maxLength');
    if (params.spotCount < 6 || params.spotCount > 8) problems.push(`params: spotCount ${params.spotCount} outside 6–8`);

    // -- the road ---------------------------------------------------------

    for (const [i, point] of map.waypoints.entries()) {
        if (point.x < -0.5 - EPSILON || point.x > map.width + EPSILON) {
            problems.push(`waypoint ${i} x ${point.x} is outside the board`);
        }
        if (point.y < -EPSILON || point.y > map.height + EPSILON) {
            problems.push(`waypoint ${i} y ${point.y} is outside the board`);
        }
    }
    for (let i = 1; i < map.waypoints.length; i++) {
        const a = map.waypoints[i - 1];
        const b = map.waypoints[i];
        if (a.x !== b.x && a.y !== b.y) problems.push(`segment ${i} is diagonal`);
    }
    if (map.waypoints.length < 2) problems.push('the road needs at least two waypoints');

    const cells = roadCells(map.waypoints, map.width, map.height, problems);

    // The entrance owns column 0; the gate is an inset tile of the last row.
    if (cells.length > 0) {
        const first = cells[0];
        const last = cells[cells.length - 1];
        if (first.x !== 0) problems.push(`the road starts at column ${first.x}, not the left edge`);
        if (last.y !== map.height - 1) problems.push(`the road ends at row ${last.y}, not the last row`);
        if (last.x < 2 || last.x > map.width - 3) problems.push(`gate column ${last.x} leaves no room for the castle`);
    }

    if (map.pathLength !== cells.length) {
        problems.push(`pathLength ${map.pathLength} disagrees with the ${cells.length} road tiles`);
    }
    if (cells.length < params.minLength || cells.length > params.maxLength) {
        problems.push(`road is ${cells.length} tiles, outside ${params.minLength}–${params.maxLength}`);
    }

    const turns = countTurns(map.waypoints);
    if (turns < params.minTurns || turns > params.maxTurns) {
        problems.push(`${turns} turns, outside ${params.minTurns}–${params.maxTurns}`);
    }

    // One tile wide: every road neighbour must be the previous or the next tile.
    const onRoad = new Set<number>(cells.map((cell) => cell.y * map.width + cell.x));
    for (const [i, cell] of cells.entries()) {
        for (const [dx, dy] of ORTHOGONAL) {
            const nx = cell.x + dx;
            const ny = cell.y + dy;
            if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
            if (!onRoad.has(ny * map.width + nx)) continue;
            const isPrevious = i > 0 && cells[i - 1].x === nx && cells[i - 1].y === ny;
            const isNext = i < cells.length - 1 && cells[i + 1].x === nx && cells[i + 1].y === ny;
            if (!isPrevious && !isNext) {
                problems.push(`road tile (${cell.x}, ${cell.y}) touches the road at (${nx}, ${ny})`);
            }
        }
    }

    // -- the spots --------------------------------------------------------

    if (map.spots.length !== params.spotCount) {
        problems.push(`${map.spots.length} spots, expected ${params.spotCount}`);
    }

    const gate = map.waypoints[map.waypoints.length - 1];
    for (const [i, spot] of map.spots.entries()) {
        if (spot.id !== `s${i}`) problems.push(`spot ${i} has id "${spot.id}"`);

        if (spot.x <= 0 || spot.x >= map.width || spot.y <= 0 || spot.y >= map.height) {
            problems.push(`spot ${i} (${spot.x}, ${spot.y}) is outside the board`);
        }
        if (spot.x - Math.floor(spot.x) !== 0.5 || spot.y - Math.floor(spot.y) !== 0.5) {
            problems.push(`spot ${i} (${spot.x}, ${spot.y}) is not a cell centre`);
        }

        const cellX = Math.floor(spot.x);
        const cellY = Math.floor(spot.y);
        if (onRoad.has(cellY * map.width + cellX)) problems.push(`spot ${i} sits on the road`);

        const nearest = nearestRoadTile(spot, cells);
        if (nearest < 1 - EPSILON || nearest > 2 + EPSILON) {
            problems.push(`spot ${i} is ${nearest.toFixed(3)} tiles from the road, outside 1–2`);
        }

        if (!fitsBesideGateCastle(spot, gate)) problems.push(`spot ${i} hides under the gate castle`);

        for (const other of map.spots.slice(i + 1)) {
            const dx = spot.x - other.x;
            const dy = spot.y - other.y;
            if (dx * dx + dy * dy < 2.25 - EPSILON) {
                problems.push(`spots ${i} and ${other.id} are closer than 1.5 tiles`);
            }
        }
    }

    // Coverage: every road tile within towerRange of at least one spot.
    const towerRangeSquared = params.towerRange * params.towerRange;
    let uncovered = 0;
    for (const cell of cells) {
        let reached = false;
        for (const spot of map.spots) {
            const dx = spot.x - (cell.x + 0.5);
            const dy = spot.y - (cell.y + 0.5);
            if (dx * dx + dy * dy <= towerRangeSquared + EPSILON) {
                reached = true;
                break;
            }
        }
        if (!reached) uncovered++;
    }
    if (uncovered > 0) {
        problems.push(`${uncovered} road tiles are out of every spot's ${params.towerRange}-tile range`);
    }

    return problems;
}

const ORTHOGONAL: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

/**
 * Every road cell in path order — cells whose centre lies within half a tile of the
 * polyline, deduplicated. A cell appearing twice means the road crosses itself; the
 * problem is appended to `problems` and the duplicate is skipped.
 */
export function roadCells(
    waypoints: readonly Point[],
    width: number,
    height: number,
    problems: string[] = [],
): Cell[] {
    const cells: Cell[] = [];
    const seen = new Set<number>();

    for (let i = 0; i + 1 < waypoints.length; i++) {
        const segment = cellsOfSegment(waypoints[i], waypoints[i + 1], width, height);
        // Segments share their endpoint's cell with the segment before.
        const start = i === 0 ? 0 : 1;
        for (let j = start; j < segment.length; j++) {
            const cell = segment[j];
            const key = cell.y * width + cell.x;
            if (seen.has(key)) {
                problems.push(`the road crosses itself at (${cell.x}, ${cell.y})`);
                continue;
            }
            seen.add(key);
            cells.push(cell);
        }
    }
    return cells;
}

/** Direction changes along the polyline; the entrance segment counts as straight. */
export function countTurns(waypoints: readonly Point[]): number {
    let turns = 0;
    let previousDx = 0;
    let previousDy = 0;
    for (let i = 1; i < waypoints.length; i++) {
        const dx = Math.sign(waypoints[i].x - waypoints[i - 1].x);
        const dy = Math.sign(waypoints[i].y - waypoints[i - 1].y);
        if (dx === 0 && dy === 0) continue;
        if ((previousDx !== 0 || previousDy !== 0) && (dx !== previousDx || dy !== previousDy)) turns++;
        previousDx = dx;
        previousDy = dy;
    }
    return turns;
}

/** The grid cells whose centres lie within 0.5 tiles of the segment, ordered along it. */
function cellsOfSegment(a: Point, b: Point, width: number, height: number): Cell[] {
    const cells: Cell[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            const projection = lengthSquared === 0 ? 0 : ((cx - a.x) * dx + (cy - a.y) * dy) / lengthSquared;
            const t = Math.min(1, Math.max(0, projection));
            const px = a.x + dx * t;
            const py = a.y + dy * t;
            const ddx = cx - px;
            const ddy = cy - py;
            if (ddx * ddx + ddy * ddy <= 0.25 + EPSILON) cells.push({ x, y });
        }
    }

    // Order along the segment so the path keeps entrance → gate direction.
    cells.sort((left, right) => {
        const project = (cell: Cell): number =>
            lengthSquared === 0
                ? 0
                : ((cell.x + 0.5 - a.x) * dx + (cell.y + 0.5 - a.y) * dy) / lengthSquared;
        return project(left) - project(right);
    });
    return cells;
}

/** Distance in tiles from a point to the nearest road tile centre. */
function nearestRoadTile(point: Point, cells: readonly Cell[]): number {
    let best = Number.POSITIVE_INFINITY;
    for (const cell of cells) {
        const dx = point.x - (cell.x + 0.5);
        const dy = point.y - (cell.y + 0.5);
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < best) best = distanceSquared;
    }
    return Math.sqrt(best);
}
