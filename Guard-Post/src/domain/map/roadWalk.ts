import type { Cell, MapParams } from './types.ts';

/**
 * The road: a constrained random walk from the left edge to a gate in the last row.
 *
 * The walk is depth-first with an explicit stack: each frame computes its legal moves
 * once — ordered by the move weights — and works through them with a cursor, so an
 * exhausted branch is never re-entered and the search always makes progress. Three
 * rules keep the result a clean one-tile line:
 *
 *   - the road never runs alongside itself — no neighbour of the next cell may already
 *     be on the path, except the cell stepped from;
 *   - column 0 belongs to the entrance alone, so the start shows exactly one road tile
 *     on the edge and the first step is forced into the board;
 *   - stepping onto the last row ends the walk there (and only when the length and turn
 *     budget allow a legal finish), so the gate is one tile wide and is always entered
 *     from above — the end of the road is a single line, never a run along the edge.
 *
 * The walk is pure: same `params` and same `rng` draws, same road. A budget of
 * 20 000 expanded nodes bounds every attempt, so generation can never loop forever.
 *
 * The loop is deliberately allocation-light — it runs tens of thousands of nodes per
 * map — so the neighbour table lives at module level, moves are read by index and the
 * weighted order is built without closures.
 */

/** Moves in pick order: right, left, down, up — with their weights (3 : 2 : 3 : 1). */
const MOVES: readonly (readonly [number, number, number])[] = [
    [1, 0, 3],
    [-1, 0, 2],
    [0, 1, 3],
    [0, -1, 1],
];

/** The only way into the last row: straight down, from the tile above the gate. */
const DOWN = 2;

/** Node budget for a single attempt; a successful walk costs a few thousand. */
const NODE_BUDGET = 20000;

/** One frame of the explicit stack: where the path is, and how it got there. */
interface Frame {
    readonly x: number;
    readonly y: number;
    /** Direction the path arrived with; `0,0` at the entrance. */
    readonly dx: number;
    readonly dy: number;
    /** Direction changes so far. */
    readonly turns: number;
    /**
     * The frame's legal moves as `MOVES` slots, in weighted order — computed on first
     * visit. Plain slot numbers keep the hot loop allocation-free: one tiny array per
     * frame instead of a pool of move objects.
     */
    moves: number[] | null;
    /** How many of `moves` have already been tried. */
    cursor: number;
}

interface Move {
    readonly x: number;
    readonly y: number;
    readonly dx: number;
    readonly dy: number;
    readonly turns: number;
    readonly weight: number;
}

/**
 * Walks the grid and returns the road's cells, entrance first, gate last.
 * `null` means every branch hit a dead end, the budget, or no legal finish — the
 * caller retries with a fresh attempt seed.
 */
export function walkRoad(params: MapParams, rng: () => number): Cell[] | null {
    const { width, height } = params;

    // Start: column 0, a row between 1 and 4 — the road enters from the left edge.
    const startRow = 1 + Math.floor(rng() * Math.max(1, Math.min(4, height - 2)));

    const visited = new Uint8Array(width * height);
    const stack: Frame[] = [{ x: 0, y: startRow, dx: 0, dy: 0, turns: 0, moves: null, cursor: 0 }];
    visited[startRow * width] = 1;

    let nodes = 0;
    while (stack.length > 0 && nodes < NODE_BUDGET) {
        nodes++;
        const head = stack[stack.length - 1];

        if (head.moves === null) {
            const finish = legalFinish(head, stack.length, params, visited);
            if (finish) {
                const cells: Cell[] = stack.map((frame) => ({ x: frame.x, y: frame.y }));
                cells.push({ x: finish.x, y: finish.y });
                return cells;
            }
            head.moves = orderedMoves(head, stack.length, params, visited, rng);
            head.cursor = 0;
        }

        if (head.cursor >= head.moves.length) {
            // Every branch from here is exhausted: backtrack.
            visited[head.y * width + head.x] = 0;
            stack.pop();
            continue;
        }

        const slot = head.moves[head.cursor];
        head.cursor += 1;
        const dx = MOVES[slot][0];
        const dy = MOVES[slot][1];
        const x = head.x + dx;
        const y = head.y + dy;
        visited[y * width + x] = 1;
        stack.push({ x, y, dx, dy, turns: turnsAfter(head, dx, dy), moves: null, cursor: 0 });
    }
    return null;
}

/**
 * The move straight onto the last row when it would be a legal finish, else `null`.
 * Straight down is the only way in: the walk can never stand on the last row without
 * having finished, so nothing approaches the gate sideways.
 */
function legalFinish(head: Frame, depth: number, params: MapParams, visited: Uint8Array): Move | null {
    const { width, height, minLength, maxLength, minTurns, maxTurns } = params;
    if (head.y !== height - 2) return null;
    // The gate sits two tiles inset so the three-tile castle fits fully on the board
    // (see `fitsBesideGateCastle`).
    if (head.x < 2 || head.x > width - 3) return null;

    const tiles = depth + 1;
    if (tiles < minLength || tiles > maxLength) return null;

    const x = head.x;
    const y = height - 1;
    if (visited[y * width + x]) return null;
    if (touchesPath(x, y, head, visited, width, height)) return null;

    const turns = turnsAfter(head, 0, 1);
    if (turns < minTurns || turns > maxTurns) return null;
    return { x, y, dx: 0, dy: 1, turns, weight: MOVES[DOWN][2] };
}

/**
 * The head's legal ordinary moves as `MOVES` slots, biased by the weights (right 3,
 * left 2, down 3, up 1): weighted sampling without replacement puts likelier moves
 * first, so the depth-first search prefers them without ever excluding the rest.
 * Cheap predicates run before the one-tile-wide test, which is the expensive one.
 */
function orderedMoves(head: Frame, depth: number, params: MapParams, visited: Uint8Array, rng: () => number): number[] {
    const { width, height, maxLength, maxTurns } = params;
    const tiles = depth + 1;

    const pool: number[] = [];
    for (let i = 0; i < MOVES.length; i++) {
        const move = MOVES[i];
        const dx = move[0];
        const dy = move[1];
        const x = head.x + dx;
        const y = head.y + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[y * width + x]) continue;
        // Column 0 is the entrance's alone: the start is exactly one grid wide.
        if (x === 0) continue;
        // The last row is only ever entered as a legal finish (see `legalFinish`).
        if (y === height - 1) continue;
        // Prune: too far from the last row to finish inside the length budget.
        if (tiles + (height - 1 - y) > maxLength) continue;
        if (turnsAfter(head, dx, dy) > maxTurns) continue;
        // One tile wide: no road on any of the four sides except the cell stepped from.
        if (touchesPath(x, y, head, visited, width, height)) continue;
        pool.push(i);
    }

    // Weighted sampling without replacement: draw, remove, redraw — no closures, and
    // only slot numbers are shuffled, never move objects.
    const ordered: number[] = [];
    let total = 0;
    for (let i = 0; i < pool.length; i++) total += MOVES[pool[i]][2];
    while (pool.length > 0) {
        let roll = rng() * total;
        let index = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
            roll -= MOVES[pool[i]][2];
            if (roll <= 0) {
                index = i;
                break;
            }
        }
        total -= MOVES[pool[index]][2];
        ordered.push(pool[index]);
        for (let i = index; i + 1 < pool.length; i++) pool[i] = pool[i + 1];
        pool.pop();
    }
    return ordered;
}

/** Direction changes after stepping `dx,dy` from `head`; the entrance step is free. */
function turnsAfter(head: Frame, dx: number, dy: number): number {
    if (head.dx === 0 && head.dy === 0) return 0;
    return head.turns + (dx !== head.dx || dy !== head.dy ? 1 : 0);
}

/** True when `(x, y)` touches any path cell other than the one stepped from. */
function touchesPath(x: number, y: number, head: Frame, visited: Uint8Array, width: number, height: number): boolean {
    // Unrolled: this runs for every candidate of every frame — tens of thousands of
    // times per map — so no loop table, no re-indexing of the visited array.
    const row = y * width;
    if (x + 1 < width && x + 1 !== head.x && visited[row + x + 1]) return true;
    if (x > 0 && x - 1 !== head.x && visited[row + x - 1]) return true;
    if (y + 1 < height && y + 1 !== head.y && visited[row + width + x]) return true;
    if (y > 0 && y - 1 !== head.y && visited[row - width + x]) return true;
    return false;
}
