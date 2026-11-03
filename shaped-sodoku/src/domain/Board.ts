import type { ShapeId } from './shapes.ts';

/**
 * Geometry of one Sudoku grid: how large it is, and how its boxes are cut.
 * Pure numbers — the domain never converts any of this to pixels.
 */
export interface BoardSize {
    /** Cells per row and per column. Also exactly how many distinct shapes are in play. */
    readonly size: number;
    /** Cells per box, measured vertically. */
    readonly boxRows: number;
    /** Cells per box, measured horizontally. */
    readonly boxCols: number;
}

/** 4×4 with 2×2 boxes — levels 1-3. */
export const GRID_4: BoardSize = { size: 4, boxRows: 2, boxCols: 2 };

/** 6×6 with 2×3 boxes — levels 4 and up. */
export const GRID_6: BoardSize = { size: 6, boxRows: 2, boxCols: 3 };

/** An immutable Sudoku grid. `null` marks a cell the player still has to fill. */
export interface Board {
    readonly size: BoardSize;
    /** Row-major, length `size * size`. */
    readonly cells: ReadonlyArray<ShapeId | null>;
    /** Row-major flags: `true` where the puzzle was dealt face-up and the cell is locked. */
    readonly givens: ReadonlyArray<boolean>;
}

/** Precomputed membership lists for every row, column and box — the shape of the rules. */
export interface Grid {
    readonly size: BoardSize;
    readonly cellCount: number;
    /** Box index for each cell, row-major. */
    readonly boxOf: readonly number[];
    readonly rows: ReadonlyArray<ReadonlyArray<number>>;
    readonly cols: ReadonlyArray<ReadonlyArray<number>>;
    readonly boxes: ReadonlyArray<ReadonlyArray<number>>;
}

const gridCache = new Map<BoardSize, Grid>();

/** Grids are built once per distinct `BoardSize` and reused everywhere. */
export function gridFor(size: BoardSize): Grid {
    const cached = gridCache.get(size);
    if (cached) return cached;
    const built = buildGrid(size);
    gridCache.set(size, built);
    return built;
}

function buildGrid(size: BoardSize): Grid {
    const n = size.size;
    const cellCount = n * n;
    const boxesAcross = n / size.boxCols;
    const boxCount = (n / size.boxRows) * boxesAcross;

    const boxOf = new Array<number>(cellCount);
    const rows: number[][] = Array.from({ length: n }, () => []);
    const cols: number[][] = Array.from({ length: n }, () => []);
    const boxes: number[][] = Array.from({ length: boxCount }, () => []);

    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            const index = row * n + col;
            const box = Math.floor(row / size.boxRows) * boxesAcross + Math.floor(col / size.boxCols);
            boxOf[index] = box;
            rows[row].push(index);
            cols[col].push(index);
            boxes[box].push(index);
        }
    }

    return { size, cellCount, boxOf, rows, cols, boxes };
}

export const cellIndex = (size: number, row: number, col: number): number => row * size + col;
export const rowOfCell = (size: number, index: number): number => Math.floor(index / size);
export const colOfCell = (size: number, index: number): number => index % size;

/** An all-empty board, ready to be dealt. */
export function createBoard(size: BoardSize): Board {
    const cellCount = size.size * size.size;
    return {
        size,
        cells: new Array<ShapeId | null>(cellCount).fill(null),
        givens: new Array<boolean>(cellCount).fill(false),
    };
}

/** Returns a copy of `board` with one cell filled. The input board is never mutated. */
export function withPlacement(board: Board, row: number, col: number, shape: ShapeId): Board {
    const cells = board.cells.slice();
    cells[cellIndex(board.size.size, row, col)] = shape;
    return { ...board, cells };
}

/** Builds a board from row-major cells; every filled cell becomes a locked given. */
export function withCells(size: BoardSize, cells: ReadonlyArray<ShapeId | null>): Board {
    return {
        size,
        cells: cells.slice(),
        givens: cells.map((cell) => cell !== null),
    };
}

/** How many times `shape` already appears on the board. */
export function countOf(board: Board, shape: ShapeId): number {
    let total = 0;
    for (const cell of board.cells) if (cell === shape) total++;
    return total;
}

/** Indices of the cells the player still has to fill. */
export function emptyIndices(board: Board): number[] {
    const open: number[] = [];
    for (let index = 0; index < board.cells.length; index++) {
        if (board.cells[index] === null) open.push(index);
    }
    return open;
}
