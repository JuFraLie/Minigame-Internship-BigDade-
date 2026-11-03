import { type Board, type BoardSize, gridFor, withCells } from './Board.ts';
import type { RandomPort } from './ports.ts';
import type { ShapeId } from './shapes.ts';

/**
 * Seeded, on-device puzzle generation.
 *
 * A solution is filled in by randomised backtracking, then cells are removed one at a
 * time — each removal is kept only while the puzzle still has exactly one solution. No
 * network, no storage, no pre-baked puzzles: the same seed always yields the same board,
 * which is what lets Retry replay an identical puzzle.
 */

/**
 * mulberry32: 32 bits of state, no dependencies, and identical output on every platform.
 * Reproducibility matters more here than statistical quality.
 */
export function mulberry32(seed: number): RandomPort {
    let state = seed >>> 0;
    return {
        next(): number {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        },
    };
}

function range(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
}

/** Fisher-Yates, driven by the port so every shuffle is reproducible from the seed. */
function shuffled<T>(items: readonly T[], random: RandomPort): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random.next() * (i + 1));
        const swap = out[i];
        out[i] = out[j];
        out[j] = swap;
    }
    return out;
}

function popcount(bits: number): number {
    let count = 0;
    let value = bits;
    while (value !== 0) {
        value &= value - 1;
        count += 1;
    }
    return count;
}

/**
 * Counts solutions, stopping once `limit` is reached.
 *
 * This is the uniqueness check: a puzzle is finished when the count comes back as exactly
 * one. The most-constrained-cell heuristic keeps sparse 6×6 grids cheap to verify.
 */
export function countSolutions(board: Board, limit = 2): number {
    const grid = gridFor(board.size);
    const n = grid.size.size;
    const shapeMask = (1 << n) - 1;
    const cells = board.cells.slice();

    const rowMask = new Array<number>(n).fill(0);
    const colMask = new Array<number>(n).fill(0);
    const boxMask = new Array<number>(grid.boxes.length).fill(0);

    for (let index = 0; index < cells.length; index++) {
        const shape = cells[index];
        if (shape === null) continue;
        const bit = 1 << shape;
        rowMask[Math.floor(index / n)] |= bit;
        colMask[index % n] |= bit;
        boxMask[grid.boxOf[index]] |= bit;
    }

    let found = 0;

    const fill = (): void => {
        if (found >= limit) return;

        let target = -1;
        let targetCandidates = 0;
        let targetCount = n + 1;

        for (let index = 0; index < cells.length; index++) {
            if (cells[index] !== null) continue;
            const used = rowMask[Math.floor(index / n)] | colMask[index % n] | boxMask[grid.boxOf[index]];
            const candidates = ~used & shapeMask;
            const count = popcount(candidates);
            if (count === 0) return; // this branch is impossible
            if (count < targetCount) {
                targetCount = count;
                targetCandidates = candidates;
                target = index;
                if (count === 1) break;
            }
        }

        if (target === -1) {
            found += 1;
            return;
        }

        const row = Math.floor(target / n);
        const col = target % n;
        const box = grid.boxOf[target];

        for (let shape = 0; shape < n; shape++) {
            const bit = 1 << shape;
            if ((targetCandidates & bit) === 0) continue;
            cells[target] = shape;
            rowMask[row] |= bit;
            colMask[col] |= bit;
            boxMask[box] |= bit;
            fill();
            rowMask[row] &= ~bit;
            colMask[col] &= ~bit;
            boxMask[box] &= ~bit;
            cells[target] = null;
            if (found >= limit) return;
        }
    };

    fill();
    return found;
}

/**
 * Fills a whole grid with a valid solution.
 *
 * The candidate order is reshuffled at every cell, so seeds that differ even slightly
 * produce visibly different boards rather than the same one with a rotated row.
 */
function buildSolution(size: BoardSize, random: RandomPort): (ShapeId | null)[] | null {
    const n = size.size;
    const grid = gridFor(size);
    const cells = new Array<ShapeId | null>(n * n).fill(null);

    const rowMask = new Array<number>(n).fill(0);
    const colMask = new Array<number>(n).fill(0);
    const boxMask = new Array<number>(grid.boxes.length).fill(0);

    const fill = (index: number): boolean => {
        if (index === cells.length) return true;
        const row = Math.floor(index / n);
        const col = index % n;
        const box = grid.boxOf[index];
        const used = rowMask[row] | colMask[col] | boxMask[box];

        for (const shape of shuffled(range(n), random)) {
            const bit = 1 << shape;
            if ((used & bit) !== 0) continue;
            cells[index] = shape;
            rowMask[row] |= bit;
            colMask[col] |= bit;
            boxMask[box] |= bit;
            if (fill(index + 1)) return true;
            rowMask[row] &= ~bit;
            colMask[col] &= ~bit;
            boxMask[box] &= ~bit;
            cells[index] = null;
        }
        return false;
    };

    return fill(0) ? cells : null;
}

export interface GenerateOptions {
    readonly size: BoardSize;
    /** How many cells the player is left with. */
    readonly givenCount: number;
    readonly random: RandomPort;
    /**
     * Removal passes to attempt before settling. Each pass can only ever reduce the
     * puzzle, so stopping early yields a valid — if slightly easier — board.
     */
    readonly maxPasses?: number;
}

/**
 * Generates a unique puzzle with (as close as possible to) the requested given count.
 *
 * Uniqueness is never traded away for difficulty: if the budget runs out with more
 * givens than asked for, the board is returned anyway rather than shipped with more than
 * one solution.
 */
export function generatePuzzle(options: GenerateOptions): Board {
    const { size, givenCount, random } = options;
    const maxPasses = options.maxPasses ?? 24;
    const n = size.size;
    const cellCount = n * n;
    const target = Math.min(Math.max(givenCount, n), cellCount - 1);

    const solution = buildSolution(size, random);
    if (!solution) throw new Error(`Unable to solve a ${n}x${n} grid`);

    const cells: (ShapeId | null)[] = solution.slice();
    const order = shuffled(range(cellCount), random);
    let remaining = cellCount;

    for (let pass = 0; pass < maxPasses && remaining > target; pass++) {
        let removedThisPass = 0;

        for (const index of order) {
            if (remaining <= target) break;
            if (cells[index] === null) continue;

            const saved = cells[index];
            cells[index] = null;

            if (countSolutions(withCells(size, cells), 2) === 1) {
                remaining -= 1;
                removedThisPass += 1;
            } else {
                cells[index] = saved;
            }
        }

        // Nothing could be removed this round, so further passes would repeat the work.
        if (removedThisPass === 0) break;
    }

    return withCells(size, cells);
}

/** Convenience wrapper for callers that already hold a seed rather than a RandomPort. */
export function generatePuzzleFromSeed(size: BoardSize, givenCount: number, seed: number): Board {
    return generatePuzzle({ size, givenCount, random: mulberry32(seed) });
}
