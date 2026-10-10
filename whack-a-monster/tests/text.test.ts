import assert from 'node:assert/strict';
import test from 'node:test';

import type Phaser from 'phaser';
import { addText } from '../src/rendering/text.ts';

/**
 * Phaser stamps a text's resolution onto its texture source exactly once, while the Text is
 * being built (`frame.source.resolution = style.resolution`), and the canvas renderer divides
 * the size it draws by that stamp. `Text.setResolution()` rebuilds the — larger — text canvas
 * but never re-stamps the source, which keeps reporting 1, so every glyph is drawn
 * `renderScale()` times too large: invisible on a 1x desktop, but on the 2x phone of the host
 * app it crowded the Play Screen apart — cut-off title, jammed monster labels, the how-to
 * text running over the sprites. The resolution therefore has to be part of the style the
 * text is created with.
 *
 * `renderScale()` samples the device density once, for the whole launch, so the density is
 * faked before the first text of this file is created.
 */

/** Stand-in for a scene: records the style the text was created with, and refuses to be told
 *  the resolution afterwards — that is the path that silently doubles every glyph. */
const fakeScene = (styles: Record<string, unknown>[]): Phaser.Scene =>
    ({
        add: {
            text: (_x: number, _y: number, _content: string, style: Record<string, unknown>) => {
                styles.push(style);
                return {
                    setResolution: (): never => {
                        throw new Error('the resolution must be part of the style, not applied afterwards');
                    },
                };
            },
        },
    }) as unknown as Phaser.Scene;

test('the device density reaches every text as part of its style', () => {
    Object.defineProperty(globalThis, 'window', {
        value: { devicePixelRatio: 2 },
        configurable: true,
        writable: true,
    });

    const styles: Record<string, unknown>[] = [];
    addText(fakeScene(styles), 0, 0, 'WHACK-A-MONSTER', { fontSize: '44px', color: '#ffeb3b' });

    assert.equal(styles.length, 1, 'one text object is created');
    assert.equal(styles[0].resolution, 2, 'a 2x-density device rasterises text at 2x');
    assert.equal(styles[0].fontSize, '44px', 'the caller style is kept');
    assert.equal(styles[0].color, '#ffeb3b', 'the caller style is kept');
});
