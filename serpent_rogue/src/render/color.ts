// color.ts — bridges THEME's CSS colour strings and Phaser's Graphics API.
//
// The theme is written as CSS (`#rrggbb`, `rgba(r, g, b, a)`) because that is
// what the game's palette is authored in; `Phaser.GameObjects.Graphics` wants a
// 24-bit number plus a separate alpha. Parsing lives here so no drawing code
// ever hand-splits a colour string, and so the conversion stays pure and
// testable.

import type Phaser from 'phaser';

export interface Rgba {
  rgb: number;
  alpha: number;
}

const HEX = /^#([0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Parses a THEME colour. Unknown input falls back to opaque black. */
export function parseColor(css: string): Rgba {
  const hex = HEX.exec(css);
  if (hex) {
    return { rgb: Number.parseInt(hex[1], 16), alpha: 1 };
  }

  const rgba = RGBA.exec(css);
  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    return {
      rgb: (r << 16) | (g << 8) | b,
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }

  return { rgb: 0x000000, alpha: 1 };
}

/** Applies a THEME colour as the Graphics' current fill. */
export function fillCss(graphics: Phaser.GameObjects.Graphics, css: string): void {
  const { rgb, alpha } = parseColor(css);
  graphics.fillStyle(rgb, alpha);
}

/** Applies a THEME colour as the Graphics' current stroke of the given width. */
export function strokeCss(
  graphics: Phaser.GameObjects.Graphics,
  css: string,
  width: number,
): void {
  const { rgb, alpha } = parseColor(css);
  graphics.lineStyle(width, rgb, alpha);
}
