import Phaser from 'phaser';

/**
 * The chunky-cartoon chrome: bevelled slabs, thick outlines, gloss, drop shadows, ribbons.
 *
 * This is the vocabulary a casual phone game speaks — a button is not a coloured rectangle,
 * it is a face sitting on a darker edge, ringed in ink, lit from above and casting a
 * shadow onto whatever is behind it. Every screen in this game builds itself out of these
 * few primitives, so the whole game reads as one object rather than four.
 *
 * It lives in the render layer and is drawn with Phaser Graphics because the project ships
 * no image files at all. Shading happens once, here, at draw time: the Canvas renderer
 * ignores tint entirely, so nothing in this game is ever recoloured after it is painted.
 */

/** Darkens a colour toward black. `amount` runs `0` (untouched) to `1` (black). */
export function darken(colour: number, amount: number): number {
    const amount01 = Math.max(0, Math.min(1, amount));
    const r = Math.round(((colour >> 16) & 0xff) * (1 - amount01));
    const g = Math.round(((colour >> 8) & 0xff) * (1 - amount01));
    const b = Math.round((colour & 0xff) * (1 - amount01));
    return (r << 16) | (g << 8) | b;
}

/** Lifts a colour toward white. `amount` runs `0` (untouched) to `1` (white). */
export function lighten(colour: number, amount: number): number {
    const amount01 = Math.max(0, Math.min(1, amount));
    const lift = (value: number): number => Math.round(value + (255 - value) * amount01);
    const r = lift((colour >> 16) & 0xff);
    const g = lift((colour >> 8) & 0xff);
    const b = lift(colour & 0xff);
    return (r << 16) | (g << 8) | b;
}

/** How one slab is shaded. Every field is optional; `fill` is the only requirement. */
export interface BevelSpec {
    /** Colour of the lit top face. */
    readonly fill: number;
    /** Thickness of the darker edge below the face; `0` draws the slab flat. */
    readonly depth?: number;
    /** Outline colour; defaults to a darkened fill. */
    readonly outline?: number;
    readonly outlineAlpha?: number;
    readonly outlineWidth?: number;
    /** Drop shadow offset below the slab; `0` omits the shadow. */
    readonly drop?: number;
    /** Strength of the white gloss across the top of the face; `0` omits it. */
    readonly gloss?: number;
}

/**
 * Draws one bevelled slab: shadow, dropped dark edge, face, ink outline, gloss capsule.
 *
 * The edge and the face are the same rounded rectangle at two heights, which is what gives
 * the shape its thickness without ever redrawing the geometry. Callers size their hit areas
 * as `height + depth`, because that is how tall the finished slab actually is.
 */
export function drawBevel(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    spec: BevelSpec,
): void {
    const depth = Math.max(0, spec.depth ?? Math.max(3, height * 0.14));
    const outlineWidth = spec.outlineWidth ?? 3;
    const outline = spec.outline ?? darken(spec.fill, 0.45);
    const drop = Math.max(0, spec.drop ?? 0);
    const inset = outlineWidth * 0.5;

    if (drop > 0) {
        gfx.fillStyle(0x090c22, 0.34);
        gfx.fillRoundedRect(x + 1, y + depth + drop, width, height, radius);
    }

    if (depth > 0) {
        // The shaded underside gets its own darker ring, so it reads as a second surface
        // rather than the same rectangle smeared downward.
        gfx.fillStyle(darken(spec.fill, 0.42), 1);
        gfx.fillRoundedRect(x, y + depth, width, height, radius);
        gfx.lineStyle(outlineWidth, darken(spec.fill, 0.6), 1);
        gfx.strokeRoundedRect(x, y + depth, width, height, radius);
    }

    gfx.fillStyle(spec.fill, 1);
    gfx.fillRoundedRect(x, y, width, height, radius);

    gfx.lineStyle(outlineWidth, outline, spec.outlineAlpha ?? 1);
    gfx.strokeRoundedRect(x, y, width, height, radius);

    const gloss = spec.gloss ?? 0.26;
    if (gloss > 0 && height > 12) {
        const glossHeight = Math.min(height * 0.4, radius);
        gfx.fillStyle(0xffffff, gloss);
        gfx.fillRoundedRect(
            x + inset + 2,
            y + inset + 1,
            width - (inset + 2) * 2,
            glossHeight,
            Math.min(glossHeight / 2, radius),
        );
    }
}

type Point = { x: number; y: number };

/**
 * A banner with V-notched ends — the ribbon a result screen hangs its verdict from.
 *
 * The notch is what separates it from an ordinary rounded rectangle: it gives the heading
 * its own silhouette, so the eye lands there first without needing a bigger font.
 */
export function drawRibbon(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    spec: BevelSpec,
): void {
    const depth = Math.max(0, spec.depth ?? 4);
    const outlineWidth = spec.outlineWidth ?? 3;
    const outline = spec.outline ?? darken(spec.fill, 0.5);
    const drop = Math.max(0, spec.drop ?? 0);
    const right = x + width;
    const notch = Math.min(width * 0.08, height * 0.5);

    const path = (offsetY: number): Point[] => [
        { x, y: y + offsetY },
        { x: right, y: y + offsetY },
        { x: right - notch, y: y + height / 2 + offsetY },
        { x: right, y: y + height + offsetY },
        { x, y: y + height + offsetY },
        { x: x + notch, y: y + height / 2 + offsetY },
    ];

    if (drop > 0) {
        gfx.fillStyle(0x090c22, 0.32);
        gfx.fillPoints(path(depth + drop), true);
    }

    if (depth > 0) {
        gfx.fillStyle(darken(spec.fill, 0.38), 1);
        gfx.fillPoints(path(depth), true);
    }

    const face = path(0);
    gfx.fillStyle(spec.fill, 1);
    gfx.fillPoints(face, true);
    gfx.lineStyle(outlineWidth, outline, spec.outlineAlpha ?? 1);
    gfx.strokePoints(face, true, true);
}
