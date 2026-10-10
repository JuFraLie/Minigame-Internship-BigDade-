import { FIELD_HEIGHT, FIELD_WIDTH, holePosition, HOLE_RADIUS, RISE_DISTANCE_RATIO } from '../core/config.ts';
import type { FieldPoint } from '../core/config.ts';

/**
 * Maps the logical play field onto the screen.
 *
 * Two coordinate systems are in play and this module is the only place that knows about
 * both of them:
 *
 * - **field space** — what the simulation uses (`core/`), fixed at `FIELD_WIDTH x FIELD_HEIGHT`.
 * - **screen space** — design pixels of the game canvas, which follow whatever aspect ratio
 *   the device reports.
 *
 * The mapping keeps a uniform scale, so circles stay circles, and it is pure arithmetic:
 * no Phaser, no DOM, testable in isolation.
 */

/** Design-space height every layout is expressed in, independent of the device. */
export const DESIGN_HEIGHT = 800;

/** Portrait phones sit around 0.46; wider values only letterbox a desktop window. */
export const MIN_DESIGN_ASPECT = 0.42;
export const MAX_DESIGN_ASPECT = 0.9;

/** Minimum top padding so nothing hides behind a status bar or a display cutout. */
export const TOP_PADDING_RATIO = 0.05;
export const BOTTOM_PADDING_RATIO = 0.03;

/** Vertical space reserved under the cutout for the score/lives HUD. */
export const HUD_HEIGHT = 96;

export interface Viewport {
    width: number;
    height: number;
    /** Cutout/status-bar inset, already converted into screen units. */
    safeTop: number;
}

export interface FieldPlacement {
    /** Screen units per field unit. */
    scale: number;
    /** Screen position of the field's top-left corner. */
    x: number;
    y: number;
}

export interface Layout {
    viewport: Viewport;
    field: FieldPlacement;
}

/** Space reserved above the field: device cutout, floored by a percentage, plus the HUD. */
export function topPadding(viewport: Viewport): number {
    return Math.max(viewport.safeTop, viewport.height * TOP_PADDING_RATIO);
}

export function computeLayout(viewport: Viewport): Layout {
    const usableTop = topPadding(viewport) + HUD_HEIGHT;
    const usableHeight = Math.max(1, viewport.height - usableTop - viewport.height * BOTTOM_PADDING_RATIO);
    const usableWidth = Math.max(1, viewport.width);

    const scale = Math.min(usableWidth / FIELD_WIDTH, usableHeight / FIELD_HEIGHT);
    const width = FIELD_WIDTH * scale;
    const height = FIELD_HEIGHT * scale;

    return {
        viewport,
        field: {
            scale,
            x: (usableWidth - width) / 2,
            y: usableTop + (usableHeight - height) / 2,
        },
    };
}

export function fieldToScreen(layout: Layout, point: FieldPoint): FieldPoint {
    return {
        x: layout.field.x + point.x * layout.field.scale,
        y: layout.field.y + point.y * layout.field.scale,
    };
}

/** The inverse transform: input enters the simulation through this function. */
export function screenToField(layout: Layout, point: FieldPoint): FieldPoint {
    return {
        x: (point.x - layout.field.x) / layout.field.scale,
        y: (point.y - layout.field.y) / layout.field.scale,
    };
}

export function holeScreenPosition(layout: Layout, hole: number): FieldPoint {
    return fieldToScreen(layout, holePosition(hole));
}

/** Distance a risen monster sits above its hole, in screen units. */
export function riseOffset(layout: Layout, rise: number): number {
    return rise * HOLE_RADIUS * RISE_DISTANCE_RATIO * layout.field.scale;
}

/** Converts a field-space length (a radius, a shake distance) into screen units. */
export function toScreenLength(layout: Layout, length: number): number {
    return length * layout.field.scale;
}
