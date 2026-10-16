/**
 * Ring road geometry.
 *
 * The ring is the one-cell road that surrounds the lot: every cell of the
 * `(cols + 2) x (rows + 2)` board that is not part of the lot itself. Cells are numbered
 * clockwise, which is the direction traffic always flows, so "one cell ahead" is simply
 * `index + 1` and a whole lap is `ringLength()` cells.
 *
 * All coordinates here are LOT-SPACE: the lot runs `0 .. cols-1 / 0 .. rows-1` and the ring
 * lives at `-1` and at `cols` / `rows`. No pixels — the renderer maps lot space to screen.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** Unit step of a car facing `dir`. Lot space has +y pointing DOWN, like the screen. */
export function directionVector(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
        case 'up':
            return { dx: 0, dy: -1 };
        case 'down':
            return { dx: 0, dy: 1 };
        case 'left':
            return { dx: -1, dy: 0 };
        case 'right':
            return { dx: 1, dy: 0 };
    }
}

/** Ring cells: the perimeter of the board minus the lot. */
export function ringLength(cols: number, rows: number): number {
    return 2 * cols + 2 * rows + 4;
}

/** Positive modulo, so a lap can wrap around index 0 without a branch at every call site. */
export function mod(value: number, size: number): number {
    return ((value % size) + size) % size;
}

/** Lot-space coordinate of ring cell `index`, numbered clockwise from the top-left corner. */
export function ringCellAt(cols: number, rows: number, index: number): { x: number; y: number } {
    let i = mod(Math.floor(index), ringLength(cols, rows));

    // Top row, left to right: (-1, -1) .. (cols, -1).
    if (i < cols + 2) return { x: i - 1, y: -1 };
    i -= cols + 2;

    // Right column, top to bottom: (cols, 0) .. (cols, rows).
    if (i < rows + 1) return { x: cols, y: i };
    i -= rows + 1;

    // Bottom row, right to left: (cols - 1, rows) .. (-1, rows).
    if (i < cols + 1) return { x: cols - 1 - i, y: rows };
    i -= cols + 1;

    // Left column, bottom to top: (-1, rows - 1) .. (-1, 0).
    return { x: -1, y: rows - 1 - i };
}

/** Clockwise travel direction on the ring segment holding cell `index`. */
export function ringDirectionAt(cols: number, rows: number, index: number): { dx: number; dy: number } {
    const i = mod(Math.floor(index), ringLength(cols, rows));
    if (i < cols + 2) return { dx: 1, dy: 0 };
    if (i < cols + 2 + rows + 1) return { dx: 0, dy: 1 };
    if (i < cols + 2 + rows + 1 + cols + 1) return { dx: -1, dy: 0 };
    return { dx: 0, dy: -1 };
}

/**
 * Continuous point on the ring at `pos` cells from index 0, plus the direction of travel
 * there. Fractional positions interpolate along the segment, which is what turns a ring
 * car's cell counter into a drawable position.
 */
export function ringPointAt(
    cols: number,
    rows: number,
    pos: number,
): { x: number; y: number; dx: number; dy: number } {
    const p = mod(pos, ringLength(cols, rows));
    const cell = ringCellAt(cols, rows, p);
    const dir = ringDirectionAt(cols, rows, p);
    const fraction = p - Math.floor(p);
    return { x: cell.x + dir.dx * fraction, y: cell.y + dir.dy * fraction, dx: dir.dx, dy: dir.dy };
}

/**
 * Ring cell a car parked at lot cell `(col, row)` facing `dir` drives onto when it leaves.
 * The entry is always the ring cell just outside the car's nose.
 */
export function entryCellIndex(
    cols: number,
    rows: number,
    col: number,
    row: number,
    dir: Direction,
): number {
    switch (dir) {
        case 'up':
            return col + 1; // (col, -1), top row
        case 'right':
            return cols + 2 + row; // (cols, row), right column
        case 'down':
            return cols + 3 + rows + (cols - 1 - col); // (col, rows), bottom row
        case 'left':
            return 2 * cols + 2 * rows + 3 - row; // (-1, row), left column
    }
}
