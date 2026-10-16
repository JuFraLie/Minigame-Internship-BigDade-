import { screenToCell } from '../render/layout.ts';
import type { BoardLayout } from '../render/layout.ts';

/**
 * The door between the screen and the simulation.
 *
 * The core never sees a pixel: this adapter is the only place a pointer becomes a lot
 * cell, and it drops taps that land outside the lot — on the ring, on the HUD, in the
 * margin (AGENTS.md §4.3).
 */
export interface InputPort {
    /** A tap landed on lot cell `(col, row)`. */
    tapCell(col: number, row: number): void;
}

export interface TapEvent {
    readonly x: number;
    readonly y: number;
}

/**
 * Turns screen taps into `tapCell` calls.
 *
 * The layout is read lazily through a function rather than captured, so a resize that
 * rebuilds the board does not leave the input aiming at the old geometry.
 */
export function attachTapInput(
    subscribe: (handler: (event: TapEvent) => void) => () => void,
    layout: () => BoardLayout,
    input: InputPort,
): () => void {
    return subscribe((event) => {
        const cell = screenToCell(layout(), event.x, event.y);
        if (!cell) return;
        input.tapCell(cell.col, cell.row);
    });
}
