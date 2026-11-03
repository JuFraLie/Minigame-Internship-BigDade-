import type { Board, BoardSize } from '../src/domain/Board.ts';
import { gridFor, withCells } from '../src/domain/Board.ts';

/**
 * Test-only conveniences.
 *
 * Deliberately not matched by the `tests/*.test.ts` glob — these are fixtures, not specs.
 */

/** Builds a board from a row-major grid, marking every filled cell as a given. */
export function boardFrom(size: BoardSize, rows: ReadonlyArray<ReadonlyArray<number | null>>): Board {
    const cells = rows.flat();
    if (cells.length !== size.size * size.size) {
        throw new Error(`Expected ${size.size * size.size} cells, got ${cells.length}`);
    }
    return withCells(size, cells);
}

/** The number of cells the player was dealt face-up. */
export function givenCount(board: Board): number {
    return board.givens.reduce((total, given) => total + (given ? 1 : 0), 0);
}

/** A `ClockPort` that only moves when a test tells it to. */
export function fakeClock(start = 0): { now(): number; advance(ms: number): void } {
    let time = start;
    return {
        now: () => time,
        advance(ms: number) {
            time += ms;
        },
    };
}

/** An `EventsOutPort` that simply keeps everything it is told. */
export function recorder<T>(): { events: T[]; port: { emit(event: T): void } } {
    const events: T[] = [];
    return {
        events,
        port: { emit: (event: T) => void events.push(event) },
    };
}

/**
 * Solves a puzzle by plain backtracking.
 *
 * Test scaffolding only — the game never solves its own puzzles, because it already knows
 * the answer when it generates them. This exists so a benchmark can script a real,
 * complete playthrough.
 */
export function solve(board: Board): Array<number | null> {
    const cells = board.cells.slice();
    const n = board.size.size;
    const grid = gridFor(board.size);

    const step = (index: number): boolean => {
        if (index === cells.length) return true;
        if (cells[index] !== null) return step(index + 1);

        const used = new Set<number>();
        const row = Math.floor(index / n);
        const col = index % n;
        const box = grid.boxOf[index];
        for (const i of grid.rows[row]) if (cells[i] !== null) used.add(cells[i] as number);
        for (const i of grid.cols[col]) if (cells[i] !== null) used.add(cells[i] as number);
        for (const i of grid.boxes[box]) if (cells[i] !== null) used.add(cells[i] as number);

        for (let shape = 0; shape < n; shape++) {
            if (used.has(shape)) continue;
            cells[index] = shape;
            if (step(index + 1)) return true;
            cells[index] = null;
        }
        return false;
    };

    return step(0) ? cells : [];
}
