import type Phaser from 'phaser';
import { CORAL, PAPER, SLATE } from '../palette.ts';

/**
 * The HUD hearts, drawn as pixels.
 *
 * The health readout used to be a heart swept out with bezier curves: smooth
 * on the canvas, and mush the moment the layout scaled it away from 1:1 with
 * the device. This is the same heart as a map of blocks - 14 cells across, 13
 * down, two device pixels to a cell, so it bakes to exactly the 28 x 26
 * texture the HUD has always laid out. A chunky shape for a face set in a
 * pixel typeface.
 */

/** One row per line, `X` for a filled cell - the heart, top to bottom. */
export const HEART_PIXELS: readonly string[] = [
  '..XXXX..XXXX..',
  '.XXXXX..XXXXX.',
  'XXXXXX..XXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  '.XXXXXXXXXXXX.',
  '..XXXXXXXXXX..',
  '...XXXXXXXX...',
  '....XXXXXX....',
  '.....XXXX.....',
  '......XX......',
  '......XX......',
];

/** Device pixels one cell is drawn at; the texture is cells x this. */
export const HEART_CELL = 2;

/** The shine, as cells of the map rather than a soft highlight painted over it. */
const HEART_SHINE: ReadonlySet<string> = new Set(['2,1', '3,1', '2,2']);

/** `Phaser.Textures.FilterMode.NEAREST`, as its raw value: 1. */
const NEAREST = 1;

/** True when the cell is filled and touches empty space - the outline ring. */
const heartEdge = (col: number, row: number): boolean => {
  const filled = (c: number, r: number): boolean =>
    r >= 0 &&
    r < HEART_PIXELS.length &&
    c >= 0 &&
    c < HEART_PIXELS[r].length &&
    HEART_PIXELS[r][c] === 'X';

  if (!filled(col, row)) return false;
  return (
    !filled(col - 1, row) ||
    !filled(col + 1, row) ||
    !filled(col, row - 1) ||
    !filled(col, row + 1)
  );
};

/** Paints the map cell by cell; `colorAt` returns null to leave a cell empty. */
const paintHeart = (
  ctx: CanvasRenderingContext2D,
  colorAt: (col: number, row: number) => string | null,
): void => {
  HEART_PIXELS.forEach((cells, row) => {
    for (let col = 0; col < cells.length; col++) {
      const color = colorAt(col, row);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col * HEART_CELL, row * HEART_CELL, HEART_CELL, HEART_CELL);
    }
  });
};

const bake = (
  scene: Phaser.Scene,
  key: string,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void => {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(
    key,
    HEART_PIXELS[0].length * HEART_CELL,
    HEART_PIXELS.length * HEART_CELL,
  );
  if (!texture) return;
  draw(texture.getContext());
  texture.refresh();
  // Nearest-neighbour sampling, or the canvas smooths a scaled heart back
  // into the blur the pixel map exists to avoid: `scaleMode` is what the
  // Canvas renderer reads back as `imageSmoothingEnabled` (SetTransform.js).
  texture.setFilter(NEAREST);
};

/**
 * Bakes both hearts. Safe to call from every scene, like `generateTextures`.
 */
export const bakeHearts = (scene: Phaser.Scene): void => {
  bake(scene, 'heart_on', (ctx) => {
    paintHeart(ctx, (col, row) => {
      if (HEART_PIXELS[row][col] !== 'X') return null;
      return HEART_SHINE.has(`${col},${row}`) ? PAPER : CORAL;
    });
  });

  bake(scene, 'heart_off', (ctx) => {
    ctx.globalAlpha = 0.55;
    paintHeart(ctx, (col, row) => (heartEdge(col, row) ? SLATE : null));
    ctx.globalAlpha = 1;
  });
};
