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
 *
 * The resolution has to arrive in the style at construction time. Phaser stamps it onto the
 * texture source exactly once, while the Text is being built
 * (`frame.source.resolution = style.resolution`), and the canvas renderer divides the size
 * it draws by that stamp. `Text.setResolution()` rebuilds the — larger — text canvas but
 * never re-stamps the source, which keeps reporting 1, so every glyph is then drawn
 * `renderScale()` times too big: correct on a 1x desktop, but on a 2x phone the Play Screen
 * crowded itself out, with a cut-off title, jammed monster labels and the how-to text
 * running over the sprites.
 */
export function addText(
    scene: Phaser.Scene,
    x: number,
    y: number,
    content: string,
    style: TextStyle,
): Phaser.GameObjects.Text {
    return scene.add.text(x, y, content, { ...style, resolution: renderScale() });
}
