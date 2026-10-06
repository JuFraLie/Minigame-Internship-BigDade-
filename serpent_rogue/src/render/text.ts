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
