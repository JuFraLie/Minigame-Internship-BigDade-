import type { BoardSize } from '../domain/Board.ts';
import type { LineRef } from '../domain/Rules.ts';
import type { RoundSnapshot } from '../domain/ports.ts';
import type { ShapeId } from '../domain/shapes.ts';
import type { GameLayout } from './GameLayout.ts';

export type { GameLayout, TraySlot } from './GameLayout.ts';

/**
 * The render layer's contract.
 *
 * The domain never imports this file — the app wires a concrete renderer in and hands it
 * to the play scene. Swapping `PhaserCanvasRenderer` for a headless fake is the whole
 * point of the split: it is how game logic runs, and gets benchmarked, without Phaser.
 */
export interface RenderPort {
    /**
     * Builds every display object for a play screen.
     *
     * `grid` is handed in rather than discovered, because the renderer needs the box
     * geometry to draw the 2×2 / 2×3 group borders and to aim the completion confetti.
     */
    create(layout: GameLayout, grid: BoardSize): void;

    /** Re-positions everything for a new viewport. Safe to call on every resize. */
    relayout(layout: GameLayout): void;

    /** Redraws the board, tray and HUD from the current round state. */
    sync(snapshot: RoundSnapshot): void;

    /** Highlights the selected cell, plus its row, column and box. */
    highlight(index: number | null): void;

    /** Squash and stretch for a correct placement. */
    celebratePlacement(index: number, shape: ShapeId): void;

    /** Shake and surprise for a wrong placement, then pop the shape back out. */
    celebrateMistake(index: number, shape: ShapeId): void;

    /** Confetti burst across each row, column or box that just completed. */
    celebrateLines(lines: readonly LineRef[]): void;

    /** Pulses the screen edge to say a heart was lost. */
    pulseDanger(): void;

    /** Repaints the HUD's sound toggle to read as muted, or as live. */
    setMuted(muted: boolean): void;

    /** Releases display objects when the scene shuts down. */
    destroy(): void;
}
