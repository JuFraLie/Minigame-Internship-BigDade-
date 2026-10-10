import type Phaser from 'phaser';
import { renderScale } from './viewport.ts';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * Every text object goes through here so it is rasterised at the device density.
 *
 * The canvas backing store is `renderScale()` times the design size and the camera zooms
 * back by the same factor, which keeps world coordinates in design units — but a text
 * canvas is only ever rendered at its own resolution, so without this glyphs would be drawn
 * at design size and blown up by the camera zoom, i.e. blurred on a high-density phone.
 */
export function addText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    content: string,
    style: TextStyle,
): Phaser.GameObjects.Text {
    return scene.add.text(x, y, content, style).setResolution(renderScale());
}
