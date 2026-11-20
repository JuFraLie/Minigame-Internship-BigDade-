import Phaser from 'phaser';

import { renderScale } from '../../app/viewport.ts';
import { COLORS, hex } from './textures.ts';

/**
 * One type voice for every screen and every HUD label.
 *
 * The font is bundled in `public/fonts` and drawn at the exact pixel sizes the layout
 * asks for. Text has no outline: the hard 2 px box behind it provides the contrast, the
 * way a mobile pixel game does it. Titles get a single hard 2 px drop shadow, never a
 * blur.
 */
export const UI_FONT = '"Press Start 2P", monospace';

export interface UiTextOptions {
    readonly color?: number;
    readonly align?: 'left' | 'center' | 'right';
    readonly lineSpacing?: number;
    readonly shadow?: boolean | { readonly x?: number; readonly y?: number };
}

/** The text texture density matches the backing store, so glyphs do not blur. */
function textResolution(): number {
    return Math.max(1, Math.min(2, Math.round(renderScale())));
}

/**
 * A text object in the UI font. Sizes are clamped to a legible minimum and rounded to
 * whole pixels, because a fractional pixel font size loses its pixel grid.
 *
 * The resolution goes into the *constructor* style, so Phaser also records it on the
 * text's texture source. Calling `setResolution()` afterwards would double the drawn
 * size: the internal canvas would be 2x, but the Canvas renderer divides by the source
 * resolution, which stays at 1, so every glyph would be painted twice as large. That
 * made the whole UI look oversized and chunky on any phone (devicePixelRatio >= 1.5).
 */
export function uiText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: string,
    size: number,
    options: UiTextOptions = {},
): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: UI_FONT,
        fontSize: `${Math.max(6, Math.round(size))}px`,
        color: hex(options.color ?? COLORS.text),
        align: options.align ?? 'center',
        resolution: textResolution(),
    };

    if (options.lineSpacing !== undefined) style.lineSpacing = Math.max(0, Math.round(options.lineSpacing));

    if (options.shadow) {
        const offset = typeof options.shadow === 'object' ? options.shadow : {};
        style.shadow = {
            offsetX: offset.x ?? 2,
            offsetY: offset.y ?? 2,
            color: hex(COLORS.ink),
            blur: 0,
            stroke: false,
            fill: true,
        };
    }

    return scene.add.text(x, y, value, style);
}

/** Sets a whole-pixel font size on an existing text object. */
export function setUiFontSize(text: Phaser.GameObjects.Text, size: number): void {
    text.setFontSize(Math.max(6, Math.round(size)));
}

/**
 * The largest whole-pixel size at which `characters` glyphs still fit `maxWidth`.
 *
 * Press Start 2P is a fixed-width 8x8 face, so one glyph is roughly one em wide; the
 * 0.95 factor leaves a small margin inside a button or capsule.
 */
export function fitFontSize(maxWidth: number, characters: number, maxSize: number, minSize = 6): number {
    const perGlyph = (Math.max(1, maxWidth) * 0.95) / Math.max(1, characters);
    return Math.max(minSize, Math.min(maxSize, Math.floor(perGlyph)));
}
