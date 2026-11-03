import { type Board, cellIndex, gridFor } from './Board.ts';
import type { ShapeId } from './shapes.ts';

/** The three kinds of line a shape must not repeat along. */
export type LineKind = 'row' | 'column' | 'box';

/** Addresses one row, column or box. */
export interface LineRef {
    readonly kind: LineKind;
    readonly index: number;
}

/** The existing shape that blocks a placement, or `null` when the placement is legal. */
export interface Conflict extends LineRef {
    /** Index of the cell already holding the blocking shape. */
    readonly at: number;
}

/**
 * Where a shape would collide with an existing one.
 *
 * A cell that is already filled is not a conflict — it is simply not playable, which
 * `canPlace` reports separately.
 */
export function findConflict(board: Board, row: number, col: number, shape: ShapeId): Conflict | null {
    const grid = gridFor(board.size);
    const n = grid.size.size;
    if (row < 0 || col < 0 || row >= n || col >= n) return null;

    const index = cellIndex(n, row, col);

    for (const other of grid.rows[row]) {
        if (other !== index && board.cells[other] === shape) return { kind: 'row', index: row, at: other };
    }
    for (const other of grid.cols[col]) {
        if (other !== index && board.cells[other] === shape) return { kind: 'column', index: col, at: other };
    }
    const box = grid.boxOf[index];
    for (const other of grid.boxes[box]) {
        if (other !== index && board.cells[other] === shape) return { kind: 'box', index: box, at: other };
    }
    return null;
}

/** True when `shape` may legally be written into the empty cell at `row`, `col`. */
export function canPlace(board: Board, row: number, col: number, shape: ShapeId): boolean {
    const n = board.size.size;
    if (row < 0 || col < 0 || row >= n || col >= n) return false;
    if (board.cells[cellIndex(n, row, col)] !== null) return false;
    return findConflict(board, row, col, shape) === null;
}

/** True when a line holds every shape exactly once. */
export function isLineComplete(board: Board, ref: LineRef): boolean {
    const grid = gridFor(board.size);
    const line =
        ref.kind === 'row' ? grid.rows[ref.index] :
        ref.kind === 'column' ? grid.cols[ref.index] :
        grid.boxes[ref.index];
    if (!line) return false;

    const seen = new Set<ShapeId>();
    for (const index of line) {
        const cell = board.cells[index];
        if (cell === null || seen.has(cell)) return false;
        seen.add(cell);
    }
    return true;
}

/** True when no two filled cells collide anywhere on the board. */
export function isConsistent(board: Board): boolean {
    for (let index = 0; index < board.cells.length; index++) {
        const shape = board.cells[index];
        if (shape === null) continue;
        const row = Math.floor(index / board.size.size);
        const col = index % board.size.size;
        if (findConflict(board, row, col, shape) !== null) return false;
    }
    return true;
}

/** True when every cell is filled and every row, column and box is complete. */
export function isBoardComplete(board: Board): boolean {
    for (const cell of board.cells) if (cell === null) return false;

    const grid = gridFor(board.size);
    for (let index = 0; index < grid.rows.length; index++) {
        if (!isLineComplete(board, { kind: 'row', index })) return false;
    }
    for (let index = 0; index < grid.cols.length; index++) {
        if (!isLineComplete(board, { kind: 'column', index })) return false;
    }
    for (let index = 0; index < grid.boxes.length; index++) {
        if (!isLineComplete(board, { kind: 'box', index })) return false;
    }
    return true;
}

/**
 * Which lines the cell at `row`, `col` just completed.
 *
 * Call this only after the placement has been applied — it answers "what did that fill
 * finish?", which is exactly what the completion bonus pays for.
 */
export function completedLinesAfter(board: Board, row: number, col: number): LineRef[] {
    const grid = gridFor(board.size);
    const box = grid.boxOf[cellIndex(grid.size.size, row, col)];
    const refs: LineRef[] = [];

    if (isLineComplete(board, { kind: 'row', index: row })) refs.push({ kind: 'row', index: row });
    if (isLineComplete(board, { kind: 'column', index: col })) refs.push({ kind: 'column', index: col });
    if (isLineComplete(board, { kind: 'box', index: box })) refs.push({ kind: 'box', index: box });

    return refs;
}
