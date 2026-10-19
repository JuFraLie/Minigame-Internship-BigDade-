import type Phaser from 'phaser';
import { THEME } from './theme.ts';

/** Shared font stack: no web font is downloaded, so nothing blocks first paint. */
const FONT = 'Arial, Helvetica, sans-serif';

export interface TextOptions {
    fontSize?: string;
    fontStyle?: 'normal' | 'bold';
    color?: string;
    align?: 'left' | 'center' | 'right';
    /** Screen width the text is wrapped inside, so a long line breaks instead of running off. */
    wordWrapWidth?: number;
    /** Outline painted around the glyphs — the chunky sticker edge arcade type wants. */
    stroke?: string;
    /** Outline width in px. Only read when `stroke` is set. */
    strokeThickness?: number;
    /** Hard drop shadow (no blur): the printed edge a logo or button label has. */
    shadow?: { x: number; y: number; color: string; stroke?: boolean; fill?: boolean };
    /** Extra px between glyphs, so a short all-caps word still fills its plate. */
    letterSpacing?: number;
}

/** Thin wrapper over `scene.add.text` so every screen uses the same face and defaults. */
export function addText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    content: string,
    options: TextOptions = {},
): Phaser.GameObjects.Text {
    const text = scene.add
        .text(x, y, content, {
            fontFamily: FONT,
            fontSize: options.fontSize ?? '24px',
            fontStyle: options.fontStyle ?? 'normal',
            color: options.color ?? THEME.text.primary,
            align: options.align ?? 'left',
            wordWrap: options.wordWrapWidth ? { width: options.wordWrapWidth, useAdvancedWrap: true } : undefined,
        })
        .setOrigin(0, 0);

    // Applied after construction rather than through the style object: an outline grows the
    // texture, and building it in one pass keeps `width` / `height` correct the moment a
    // caller measures a label to size the plate it sits on.
    if (options.stroke) text.setStroke(options.stroke, options.strokeThickness ?? 4);
    if (options.letterSpacing !== undefined) text.setLetterSpacing(options.letterSpacing);
    if (options.shadow) {
        const { x: sx, y: sy, color, stroke = true, fill = true } = options.shadow;
        text.setShadow(sx, sy, color, 0, stroke, fill);
    }

    return text;
}
