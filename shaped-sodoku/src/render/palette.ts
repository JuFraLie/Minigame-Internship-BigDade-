import { MAX_SHAPES } from '../domain/shapes.ts';

/**
 * Colour, for the whole game.
 *
 * Every shape is distinguished by silhouette *and* hue, so a colourblind player never has
 * to rely on colour alone to tell a Triangle from a Square. Each hue also carries a much
 * darker outline, which keeps the shapes legible against both the cream cells and the
 * indigo background.
 */

export interface ShapeStyle {
    readonly name: 'circle' | 'triangle' | 'square' | 'star' | 'hexagon' | 'heart';
    readonly fill: number;
    readonly outline: number;
}

export const SHAPES: readonly ShapeStyle[] = [
    { name: 'circle', fill: 0xff9b91, outline: 0xb8544a }, // coral
    { name: 'triangle', fill: 0xffd873, outline: 0xc0912a }, // yellow
    { name: 'square', fill: 0x74d9c6, outline: 0x36917f }, // teal
    { name: 'star', fill: 0xb9a2ff, outline: 0x7255c4 }, // violet
    { name: 'hexagon', fill: 0x83bcff, outline: 0x4273b8 }, // blue
    { name: 'heart', fill: 0xffa3cd, outline: 0xc25f8f }, // pink
];

/** Shape style for a shape id; falls back to the last entry if asked for more than exist. */
export function shapeStyle(shape: number): ShapeStyle {
    const index = Math.min(Math.max(shape, 0), SHAPES.length - 1);
    return SHAPES[index];
}

/** How many shapes a given grid plays with (4×4 uses four, 6×6 uses all six). */
export function shapeCountFor(gridSize: number): number {
    return Math.min(gridSize, MAX_SHAPES);
}

export const PALETTE = {
    /** Deep navy at the top of the background wash. */
    bgTop: 0x1b2450,
    /** Indigo where it settles at the bottom. */
    bgBottom: 0x3d3272,
    /** The cream every board cell is painted. */
    cell: 0xfdf4e6,
    /** Alternate tint for the boxes, so 2×2 and 2×3 groups read at a glance. */
    cellAlt: 0xf6e3c8,
    /** Board backing, visible in the gaps between cells. */
    boardFrame: 0x2b2a5e,
    /** Grid hairlines inside a box. */
    gridLine: 0xcbb896,
    /** Thick borders drawn between boxes. */
    boxBorder: 0x4a3f7d,
    /** Text and HUD numerals. */
    text: 0xfdf4e6,
    /** Muted text: labels, badges at rest. */
    textMuted: 0xb9b3d8,
    /** Highlight wash behind the selected row, column and box. */
    highlight: 0xffd873,
    /** Selection ring around the chosen cell. */
    selection: 0xff9b91,
    /** Hearts in the HUD. */
    heart: 0xff7d9c,
    /** Hearts spent. */
    heartSpent: 0x555079,
    /** Panel backing on the Result screen. */
    panel: 0x262a5c,
    /** Primary button fill (Play, Next Level). */
    button: 0x74d9c6,
    buttonLabel: 0x1c2148,
    /** Secondary button fill (Retry, Exit). */
    buttonAlt: 0xb9a2ff,
    /** Danger tint used for the screen-edge pulse when a heart is lost. */
    danger: 0xff6b7f,

    // The chrome, i.e. the raised cartoon furniture every screen is built from.

    /** Ink every outline and every title stroke is drawn in. */
    ink: 0x15183c,
    /** The single shadow colour under slabs, panels and the board. */
    drop: 0x090c22,
    /** HUD capsule face. */
    hudPill: 0x171b48,
    /** HUD capsule outline. */
    hudPillEdge: 0x646ab4,
    /** Tray slot face. */
    traySlot: 0x1c2050,
    /** Tray slot outline. */
    traySlotEdge: 0x4a4f9c,
    /** Verdict ribbon on a win. */
    ribbon: 0xffd166,
    /** Verdict ribbon on a loss. */
    ribbonLoss: 0xff8296,
    /** The big score figure, and the level chip's outline. */
    gold: 0xffd76a,
    /** Board frame outline, one shade off the frame itself. */
    boardEdge: 0x12153a,
} as const;

/** The font stack: bundled system faces only, never a CDN. */
export const FONT_STACK = "'Trebuchet MS', 'Segoe UI', Roboto, system-ui, sans-serif";

/**
 * The display face: heavy, wide and geometric, for anything that has to shout.
 *
 * Also a system-only stack. `Arial Black` on Windows and macOS, `Segoe UI Black` where
 * that is the local ultra-heavy, Android's `sans-serif-black`, and a plain bold sans as
 * the last resort so a device with none of them still gets a heavy title rather than thin.
 */
export const DISPLAY_STACK =
    "'Arial Black', 'Segoe UI Black', 'sans-serif-black', 'Helvetica Neue', Arial, sans-serif";
