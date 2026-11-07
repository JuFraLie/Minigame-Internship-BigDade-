import type { GameCommand } from '../domain/ports.ts';
import type { ShapeId } from '../domain/shapes.ts';

/**
 * The play screen's geometry, as plain arithmetic.
 *
 * Nothing here touches Phaser or the DOM — it takes a viewport and returns coordinates.
 * That is what lets the input layer turn a raw tap into a puzzle command with no board
 * knowledge at all, and what makes the whole layout testable headlessly.
 *
 * The layout is deliberately ratio-driven: a square board at ~92% of the width, the tray
 * underneath, and whatever vertical height is left over spread as spacing above and below.
 * No fixed design height, so any portrait aspect ratio works.
 */

/** Positions of everything on the play screen, in design-space units. */
export interface GameLayout {
    /** The design-space viewport the layout was computed for. */
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
    /** Clearance reserved at the top for the status bar and any cutout. */
    readonly topPad: number;
    readonly hud: {
        readonly y: number;
        readonly height: number;
    };
    /**
     * The sound toggle, which leads the HUD strip from the left.
     *
     * Horizontal placement only: the strip's centre line and the shared pill height come
     * from `hud`, because the renderer sizes the pill against the measured score and the
     * layout has no text to read. Anchored by its left edge at the same margin the level
     * capsule used to start at, so the rest of the row is pushed along by its width.
     */
    readonly sound: {
        readonly x: number;
        /** Painted width. Wide enough to be a capsule rather than a circle. */
        readonly width: number;
    };
    readonly board: {
        readonly x: number;
        readonly y: number;
        /** Side length of the square board. */
        readonly size: number;
        /** Side length of one cell, gap included. */
        readonly cell: number;
        /** Inset from a cell's edge to its painted face. */
        readonly inset: number;
    };
    readonly tray: {
        readonly y: number;
        readonly height: number;
        /** Width of one slot's share of the row; also the tap acceptance width. */
        readonly slotWidth: number;
        readonly slots: readonly TraySlot[];
    };
}

export interface TraySlot {
    readonly shape: ShapeId;
    readonly cx: number;
    readonly cy: number;
    /** Painted radius of the shape in the slot. */
    readonly radius: number;
}

export interface LayoutInput {
    readonly width: number;
    readonly height: number;
    /** Device cutout / status bar inset at the top, in design units. */
    readonly safeTop: number;
    readonly safeBottom: number;
    /** Cells per row — 4 or 6. */
    readonly gridSize: number;
    /** How many shapes the tray shows; equals `gridSize` for this game. */
    readonly shapeCount: number;
}

/** Portion of the viewport the board may occupy horizontally. */
const BOARD_WIDTH_RATIO = 0.92;
/** Portion of the height reserved for the HUD strip. */
const HUD_HEIGHT_RATIO = 0.07;
/** Floor on the vertical gap, so very short viewports still separate their blocks. */
const MIN_GAP = 6;
/** Smallest board we will lay out before letting it overflow rather than vanish. */
const MIN_BOARD = 120;

/** The toggle's left edge: the same margin the HUD strip has always started at. */
const SOUND_LEFT_RATIO = 0.03;
/**
 * The toggle's width as a multiple of the strip's height.
 *
 * A capsule has to be wider than it is tall or it reads as a circle, which is the one
 * shape this row must not grow. 1.15 clears the shared pill height everywhere, and the
 * renderer widens the painted pill again if the measured score pushes the pill taller
 * than this figure assumed.
 */
const SOUND_WIDTH_RATIO = 1.15;
/** Extra tap margin either side of the painted rect; a thumb is not a stylus. */
const SOUND_HIT_PAD = 0.1;

export function computeLayout(input: LayoutInput): GameLayout {
    const width = Math.max(1, input.width);
    const height = Math.max(1, input.height);
    const gridSize = Math.max(1, input.gridSize);
    const shapeCount = Math.max(1, input.shapeCount);

    const topPad = Math.max(height * 0.08, input.safeTop);
    const bottomPad = Math.max(height * 0.03, input.safeBottom);
    const gap = Math.max(height * 0.018, MIN_GAP);
    const hudHeight = height * HUD_HEIGHT_RATIO;
    const trayHeight = Math.max(height * 0.11, 56);

    const fixed = topPad + bottomPad + hudHeight + trayHeight;
    const availableForBoard = height - fixed - 2 * gap;
    const boardSize = Math.max(MIN_BOARD, Math.min(width * BOARD_WIDTH_RATIO, availableForBoard));

    // Whatever height is left over becomes spacing, split evenly above and below, so the
    // stack stays optically centred between the cutout and the bottom edge.
    const contentHeight = hudHeight + gap + boardSize + gap + trayHeight;
    const slack = Math.max(0, height - topPad - bottomPad - contentHeight);
    const offset = slack / 2;

    const hudY = topPad + offset;
    const boardY = hudY + hudHeight + gap;
    const boardX = (width - boardSize) / 2;
    const trayY = boardY + boardSize + gap;

    const cell = boardSize / gridSize;
    const inset = Math.max(1, cell * 0.06);

    const traySpan = width * BOARD_WIDTH_RATIO;
    const trayStartX = (width - traySpan) / 2;
    const slotWidth = traySpan / shapeCount;
    const radius = Math.max(6, Math.min(trayHeight * 0.34, slotWidth * 0.38));
    const slotCy = trayY + trayHeight / 2;

    const slots: TraySlot[] = [];
    for (let shape = 0; shape < shapeCount; shape++) {
        slots.push({
            shape,
            cx: trayStartX + slotWidth * (shape + 0.5),
            cy: slotCy,
            radius,
        });
    }

    return {
        viewport: { width, height },
        topPad,
        hud: { y: hudY, height: hudHeight },
        sound: { x: width * SOUND_LEFT_RATIO, width: hudHeight * SOUND_WIDTH_RATIO },
        board: { x: boardX, y: boardY, size: boardSize, cell, inset },
        tray: { y: trayY, height: trayHeight, slotWidth, slots },
    };
}

/**
 * True when a design-space tap lands on the sound toggle.
 *
 * It sits outside the board and the tray, so `hitTest` already refuses it — the play
 * scene asks this first, because the HUD belongs to the chrome rather than to the puzzle.
 * The target is the painted capsule plus a little, and as tall as the strip: nothing
 * else in that band is tappable, so a generous miss costs nothing.
 */
export function hitSoundToggle(layout: GameLayout, x: number, y: number): boolean {
    const { x: left, width } = layout.sound;
    const centre = left + width / 2;
    const halfWidth = (width * (1 + SOUND_HIT_PAD)) / 2;
    const withinRow = y >= layout.hud.y && y <= layout.hud.y + layout.hud.height;
    return withinRow && Math.abs(x - centre) <= halfWidth;
}

/** Maps a design-space tap to the command it means, or `null` when it means nothing. */
export function hitTest(layout: GameLayout, x: number, y: number): GameCommand | null {
    const board = layout.board;
    if (x >= board.x && x < board.x + board.size && y >= board.y && y < board.y + board.size) {
        const col = Math.floor((x - board.x) / board.cell);
        const row = Math.floor((y - board.y) / board.cell);
        const gridSize = Math.round(board.size / board.cell);
        if (row < 0 || col < 0 || row >= gridSize || col >= gridSize) return null;
        return { kind: 'selectCell', row, col };
    }

    const tray = layout.tray;
    if (tray.slots.length === 0) return null;
    if (y < tray.y || y > tray.y + tray.height) return null;

    // The whole tray band is tappable and the nearest slot wins, which keeps the targets
    // generous on a narrow portrait screen.
    let nearest = tray.slots[0];
    let nearestDistance = Math.abs(x - nearest.cx);
    for (const slot of tray.slots) {
        const distance = Math.abs(x - slot.cx);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = slot;
        }
    }

    const tolerance = tray.slotWidth * 0.5 + tray.slotWidth * 0.15;
    if (nearestDistance > tolerance) return null;
    return { kind: 'pickShape', shape: nearest.shape };
}
