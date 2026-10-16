// text.ts — helpers every screen uses to place text in design units.

import type Phaser from 'phaser';
import { renderScale } from './viewport.ts';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * Every text object goes through here so it is rasterised at the device density.
 *
 * The canvas backing store is `renderScale()` times the design size and the
 * camera zooms back by the same factor, which keeps world coordinates in design
 * units — but a text canvas is only ever rendered at its own resolution, so
 * without this glyphs would be drawn at design size and blown up by the camera
 * zoom, i.e. blurred on a high-density phone.
 *
 * The resolution has to arrive in the style at construction time. Phaser stamps
 * it onto the texture source exactly once, while the Text is being built
 * (`frame.source.resolution = style.resolution`), and the canvas renderer
 * divides the size it draws by that stamp. `Text.setResolution()` rebuilds the
 * — larger — text canvas but never re-stamps the source, which keeps reporting
 * 1, so every glyph is then drawn `renderScale()` times too big: correct on a
 * 1x desktop, but on a 2x phone the level-up overlay crowded itself out, with a
 * cut-off "LEVEL UP!" title and the card text overflowing the cards.
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

/**
 * `setText` only when the value changed: assigning `text` re-rasterises the
 * glyph texture every single time, which a per-frame HUD would do 60 times a
 * second for strings that mostly never move.
 */
export function setText(text: Phaser.GameObjects.Text, value: string): void {
  if (text.text !== value) text.text = value;
}

/**
 * Converts a canvas baseline into the vertical centre Phaser's text origin uses.
 *
 * The screens are laid out as baselines (the way the game's geometry was
 * authored); a `0.5`-origin text box is centred on its own line box instead, and
 * for a typical face the centre sits about 0.35em above the baseline.
 */
export function baselineToCenter(baseline: number, fontSize: number): number {
  return baseline - fontSize * 0.35;
}
