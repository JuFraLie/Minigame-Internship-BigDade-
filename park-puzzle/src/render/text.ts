import type Phaser from 'phaser';

/** Shared font stack: no web font is downloaded, so nothing blocks first paint. */
const FONT = 'Arial, Helvetica, sans-serif';

export interface TextOptions {
    fontSize?: string;
    fontStyle?: 'normal' | 'bold';
    color?: string;
    align?: 'left' | 'center' | 'right';
    /** Screen width the text is wrapped inside, so a long line breaks instead of running off. */
    wordWrapWidth?: number;
}

/** Thin wrapper over `scene.add.text` so every screen uses the same face and defaults. */
export function addText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    content: string,
    options: TextOptions = {},
): Phaser.GameObjects.Text {
    return scene.add
        .text(x, y, content, {
            fontFamily: FONT,
            fontSize: options.fontSize ?? '24px',
            fontStyle: options.fontStyle ?? 'normal',
            color: options.color ?? '#ffffff',
            align: options.align ?? 'left',
            wordWrap: options.wordWrapWidth ? { width: options.wordWrapWidth, useAdvancedWrap: true } : undefined,
        })
        .setOrigin(0, 0);
}
