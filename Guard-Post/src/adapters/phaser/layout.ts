import { GRID_HEIGHT, GRID_WIDTH } from '../../domain/maps.ts';
import type { Vec2 } from '../../domain/types.ts';

/**
 * Screen geometry as plain arithmetic — no Phaser, no DOM.
 *
 * Everything the play screen, the Play Screen and the Result Panel draw is positioned
 * here, in design-space units, which is what lets the input layer turn a raw tap into a
 * command with no board knowledge at all and lets the whole layout be tested headlessly.
 *
 * The layout is ratio-driven rather than tied to an aspect ratio: the board is scaled to
 * the screen width (clamped by the height left over between the HUD and the bottom bar),
 * and any extra vertical height becomes spacing. Every touch target is at least 44 px.
 */

/** Smallest acceptable touch target, in design units (CSS px on the reference device). */
export const MIN_TAP = 44;

const MARGIN = 8;
const HUD_HEIGHT = 46;
const CAPSULE_HEIGHT = 40;
const BOARD_GAP = 8;
const BOTTOM_CONTENT = 64;
const MENU_HEIGHT = 132;
const CALL_WAVE_HEIGHT = 56;
/** Horizontal share of the HUD row each capsule gets, left to right. */
const CAPSULE_SHARES = [0.17, 0.22, 0.17, 0.21, 0.23] as const;

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** A build spot, projected to screen space. */
export interface SpotLayout {
    readonly id: number;
    readonly x: number;
    readonly y: number;
}

export interface LayoutInput {
    readonly width: number;
    readonly height: number;
    /** Device cutout / status bar inset at the top, in design units. */
    readonly safeTop: number;
    /** Home-indicator inset at the bottom, in design units. */
    readonly safeBottom: number;
    /** The map's build spots in world units; projected onto the board below. */
    readonly spots: readonly Vec2[];
}

export interface PlayLayout {
    readonly width: number;
    readonly height: number;
    /** Reserved clearance at the top: the larger of 32 px, 6% of height and the cutout. */
    readonly topPad: number;
    readonly hud: {
        readonly y: number;
        readonly height: number;
        readonly level: Rect;
        readonly wave: Rect;
        readonly lives: Rect;
        readonly gold: Rect;
        readonly score: Rect;
        readonly pause: Rect;
    };
    readonly board: {
        readonly x: number;
        readonly y: number;
        /** One tile, in design units. */
        readonly tile: number;
        readonly width: number;
        readonly height: number;
    };
    readonly bottom: {
        readonly y: number;
        readonly height: number;
    };
    readonly callWave: Rect;
    readonly menu: {
        readonly panel: Rect;
        /** Three tower buttons, left to right. */
        readonly buildButtons: readonly Rect[];
        /** Upgrade and Sell. */
        readonly towerButtons: readonly Rect[];
    };
    readonly resume: Rect;
    readonly spots: readonly SpotLayout[];
}

/** True when a design-space tap lands inside `rect`, grown by `pad` on every side. */
export function hitRect(rect: Rect, x: number, y: number, pad = 0): boolean {
    return x >= rect.x - pad && x <= rect.x + rect.width + pad && y >= rect.y - pad && y <= rect.y + rect.height + pad;
}

function row(startX: number, y: number, shares: readonly number[], totalWidth: number, height: number): Rect[] {
    const rects: Rect[] = [];
    let cursor = startX;
    for (const share of shares) {
        const width = totalWidth * share;
        rects.push({ x: cursor, y, width, height });
        cursor += width;
    }
    return rects;
}

export function computePlayLayout(input: LayoutInput): PlayLayout {
    const width = Math.max(1, input.width);
    const height = Math.max(1, input.height);

    // The HUD clears the status bar, the cutout and 6% of the screen — whichever is largest.
    const topPad = Math.max(input.safeTop, 32, height * 0.06);
    const hudY = topPad;

    const bottomY = height - input.safeBottom - BOTTOM_CONTENT;
    const bandTop = hudY + HUD_HEIGHT + BOARD_GAP;
    const bandBottom = bottomY - BOARD_GAP;
    const band = Math.max(1, bandBottom - bandTop);

    // Scale to the screen width, but never taller than the band left over — a short
    // screen shrinks the board instead of pushing it under the bottom bar.
    const tile = Math.max(8, Math.min(width / GRID_WIDTH, band / GRID_HEIGHT));
    const boardWidth = tile * GRID_WIDTH;
    const boardHeight = tile * GRID_HEIGHT;
    const boardX = (width - boardWidth) / 2;
    const boardY = bandTop + (band - boardHeight) / 2;

    // HUD capsules share everything left of a fixed 44 px pause button.
    const rowX = MARGIN;
    const rowWidth = width - 2 * MARGIN;
    const pause: Rect = { x: rowX + rowWidth - MIN_TAP, y: hudY + (HUD_HEIGHT - MIN_TAP) / 2, width: MIN_TAP, height: MIN_TAP };
    const capsuleArea = rowWidth - MIN_TAP - 6;
    const [level, wave, lives, gold, score] = row(rowX, hudY + (HUD_HEIGHT - CAPSULE_HEIGHT) / 2, CAPSULE_SHARES, capsuleArea, CAPSULE_HEIGHT);

    const callWaveWidth = Math.min(width * 0.6, 300);
    const callWave: Rect = {
        x: (width - callWaveWidth) / 2,
        y: bottomY + (BOTTOM_CONTENT - CALL_WAVE_HEIGHT) / 2,
        width: callWaveWidth,
        height: CALL_WAVE_HEIGHT,
    };

    const panel: Rect = { x: MARGIN, y: bottomY - 8 - MENU_HEIGHT, width: width - 2 * MARGIN, height: MENU_HEIGHT };
    const innerX = panel.x + 10;
    const innerWidth = panel.width - 20;
    const buttonY = panel.y + 36;
    const buttonHeight = MENU_HEIGHT - 36 - 10;

    const buildWidth = (innerWidth - 2 * 8) / 3;
    const buildButtons: Rect[] = [0, 1, 2].map((index) => ({
        x: innerX + index * (buildWidth + 8),
        y: buttonY,
        width: buildWidth,
        height: buttonHeight,
    }));

    const towerWidth = (innerWidth - 8) / 2;
    const towerButtons: Rect[] = [0, 1].map((index) => ({
        x: innerX + index * (towerWidth + 8),
        y: buttonY,
        width: towerWidth,
        height: buttonHeight,
    }));

    const resumeWidth = Math.min(width * 0.6, 260);
    const resume: Rect = { x: (width - resumeWidth) / 2, y: height * 0.52, width: resumeWidth, height: CALL_WAVE_HEIGHT };

    const spots: SpotLayout[] = input.spots.map((spot, id) => ({
        id,
        x: boardX + spot.x * tile,
        y: boardY + spot.y * tile,
    }));

    return {
        width,
        height,
        topPad,
        hud: { y: hudY, height: HUD_HEIGHT, level, wave, lives, gold, score, pause },
        board: { x: boardX, y: boardY, tile, width: boardWidth, height: boardHeight },
        bottom: { y: bottomY, height: BOTTOM_CONTENT },
        callWave,
        menu: { panel, buildButtons, towerButtons },
        resume,
        spots,
    };
}

// ---------------------------------------------------------------------------
// Play Screen and Result Panel geometry
// ---------------------------------------------------------------------------

export interface MenuLayout {
    readonly width: number;
    readonly titleY: number;
    readonly howToY: number;
    readonly play: Rect;
    /** The small tap icon above the Play button. */
    readonly icon: { readonly x: number; readonly y: number; readonly radius: number };
}

export function computeMenuLayout(input: Omit<LayoutInput, 'spots'>): MenuLayout {
    const width = Math.max(1, input.width);
    const height = Math.max(1, input.height);
    const topPad = Math.max(input.safeTop, 32, height * 0.06);

    const titleY = Math.max(topPad + 40, height * 0.2);
    const icon = { x: width / 2, y: titleY + height * 0.14, radius: 36 };
    const playWidth = Math.min(width * 0.62, 280);
    const play: Rect = { x: (width - playWidth) / 2, y: icon.y + icon.radius + 48, width: playWidth, height: 60 };
    const howToY = play.y + play.height + 44;

    return { width, titleY, howToY, play, icon };
}

export interface ResultLayout {
    readonly width: number;
    readonly panel: Rect;
    readonly titleY: number;
    readonly bodyY: number;
    /** Retry (defeat) or Next Level (victory). */
    readonly primary: Rect;
    readonly exit: Rect;
}

export function computeResultLayout(input: Omit<LayoutInput, 'spots'>): ResultLayout {
    const width = Math.max(1, input.width);
    const height = Math.max(1, input.height);
    const topPad = Math.max(input.safeTop, 32, height * 0.06);

    const panelWidth = Math.min(width - 32, 360);
    const panelHeight = 320;
    const panel: Rect = { x: (width - panelWidth) / 2, y: Math.max(topPad + 24, height * 0.16), width: panelWidth, height: panelHeight };

    const buttonWidth = panelWidth - 48;
    const primary: Rect = { x: panel.x + 24, y: panel.y + panelHeight - 148, width: buttonWidth, height: 56 };
    const exit: Rect = { x: panel.x + 24, y: panel.y + panelHeight - 76, width: buttonWidth, height: 56 };

    return {
        width,
        panel,
        titleY: panel.y + 58,
        bodyY: panel.y + 130,
        primary,
        exit,
    };
}
