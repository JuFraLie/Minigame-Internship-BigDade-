/**
 * Maps the board onto the screen.
 *
 * Two coordinate systems are in play and this module is the only place that knows about
 * both:
 *
 * - **lot space** — what the simulation uses (`core/`). Integer cells; the lot runs
 *   `0 .. cols-1`, the ring lives at `-1` and at `cols` / `rows`.
 * - **screen space** — design pixels of the game canvas, which follow whatever aspect
 *   ratio the device reports.
 *
 * The board is `(cols + 2) x (rows + 2)` cells including the ring, so the cell size is the
 * smaller of `width / (cols + 2)` and `usableHeight / (rows + 2)`: the board always fits,
 * and the leftover space is centred. Pure arithmetic — no Phaser, no DOM, testable alone.
 */

/** Portrait phones sit around 0.46; wider values only letterbox a desktop window. */
export const MIN_DESIGN_ASPECT = 0.42;
export const MAX_DESIGN_ASPECT = 0.9;

/** Share of screen height held back for the status bar and display cutouts. */
export const TOP_PADDING_RATIO = 0.08;
export const BOTTOM_PADDING_RATIO = 0.03;

/** Vertical space under the cutout for the HUD: score, fenders, level, pause. */
export const HUD_HEIGHT = 92;

export interface Viewport {
    width: number;
    height: number;
    /** Cutout/status-bar inset, already converted into screen units. */
    safeTop: number;
}

export interface BoardLayout {
    viewport: Viewport;
    /** Screen units per lot cell. */
    cell: number;
    /** Screen position of the ring's top-left cell. */
    x: number;
    y: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
}

/** Space above the board: the device cutout, floored by a percentage, plus the HUD. */
export function topPadding(viewport: Viewport): number {
    return Math.max(viewport.safeTop, viewport.height * TOP_PADDING_RATIO);
}

export function computeBoardLayout(viewport: Viewport, cols: number, rows: number): BoardLayout {
    const usableTop = topPadding(viewport) + HUD_HEIGHT;
    const usableHeight = Math.max(
        1,
        viewport.height - usableTop - viewport.height * BOTTOM_PADDING_RATIO,
    );
    const usableWidth = Math.max(1, viewport.width);

    // The ring adds one cell on every side, so the board is always 2 cells larger than
    // the lot in both axes.
    const cell = Math.min(usableWidth / (cols + 2), usableHeight / (rows + 2));
    const width = (cols + 2) * cell;
    const height = (rows + 2) * cell;

    return {
        viewport,
        cell,
        x: (usableWidth - width) / 2,
        y: usableTop + (usableHeight - height) / 2,
        cols,
        rows,
        width,
        height,
    };
}

/** Top-left screen corner of a lot-space cell, which may be a ring cell at `-1`. */
export function cellToScreen(layout: BoardLayout, col: number, row: number): { x: number; y: number } {
    return {
        x: layout.x + (col + 1) * layout.cell,
        y: layout.y + (row + 1) * layout.cell,
    };
}

/** Screen centre of a lot-space cell. */
export function cellCenter(layout: BoardLayout, col: number, row: number): { x: number; y: number } {
    const corner = cellToScreen(layout, col, row);
    return { x: corner.x + layout.cell / 2, y: corner.y + layout.cell / 2 };
}

/** Converts a screen point to the lot cell under it, or null when the tap missed. */
export function screenToCell(layout: BoardLayout, x: number, y: number): { col: number; row: number } | null {
    const col = Math.floor((x - layout.x) / layout.cell) - 1;
    const row = Math.floor((y - layout.y) / layout.cell) - 1;

    if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null;
    return { col, row };
}
