import type Phaser from 'phaser';

/**
 * The face of a level-up card: a light wood plank, *drawn* rather than shipped.
 * Nothing to fetch and nothing to 404 (AGENTS.md A3.4) - the same rule the
 * bullets and the hearts follow in `TextureGenerator`.
 *
 * The plank keeps the row structure the cards were laid out against, so no
 * label moves: outline / header / seam / field / seam / footer / outline over
 * `PANEL_ROWS` rows. What changed is the theme - the old art was a dark stain,
 * this is pale timber, which means every line of text on a card is now ink on
 * light wood rather than white on dark.
 *
 * Bands are expressed as fractions of the height, and the bake derives its
 * pixel boundaries from those same fractions, so the grain, the seams and the
 * text cannot drift apart when a resize recuts the plank.
 */

/** Texture key. Cut in `GameScene.applyLayout`, once per layout. */
export const PANEL_KEY = 'wood_panel';

/** The plank is 27 rows tall - the structure the card text assumes. */
export const PANEL_ROWS = 27;

/**
 * Centre of each band as a fraction of the plank's height. `LevelUpOverlay`
 * puts its lines here; the bake paints the bands from the same numbers.
 */
export const PANEL_BAND = {
  header: 3.5 / PANEL_ROWS,
  body: 13.5 / PANEL_ROWS,
  footer: 23.5 / PANEL_ROWS,
} as const;

/**
 * Pale timber, ordered lightest to darkest:
 *
 *  - `field` is the light surface the blurb sits on, so body text in ink can
 *    be as dark as the palette gets;
 *  - `plank` frames it top and bottom, one step down - the header carries the
 *    title, the footer the rarity tag;
 *  - `seam` is the pale bead between the boards, lighter than either;
 *  - `outline` is the darkest thing on the card, a carved edge that keeps the
 *    plank off the dimmed arena behind it;
 *  - `grain` is a translucent wash: timber, not noise, and never opaque
 *    enough to sit under a label as a mark.
 */
export const WOOD = {
  outline: '#513a24',
  plank: '#d2a874',
  seam: '#f8ecd8',
  field: '#ecd6b1',
  grain: 'rgba(120, 82, 44, 0.15)',
} as const;

/**
 * Grain spans, as fractions of the band they sit in. Fixed rather than
 * random: the plank is recut on every resize, and random grain would flicker
 * a new pattern each time the phone moved. The spans are uneven on purpose -
 * evenly spaced lines read as scanlines, not as timber.
 */
const GRAIN = [
  { y: 0.22, from: 0.05, to: 0.72 },
  { y: 0.51, from: 0.34, to: 0.96 },
  { y: 0.79, from: 0.13, to: 0.55 },
] as const;

/** Board rows, as `[first, lastExclusive)` of `PANEL_ROWS`. */
const BOARDS = [
  { top: 1, bottom: 6, fill: WOOD.plank },
  { top: 6, bottom: 7, fill: WOOD.seam },
  { top: 7, bottom: 20, fill: WOOD.field },
  { top: 20, bottom: 21, fill: WOOD.seam },
  { top: 21, bottom: 26, fill: WOOD.plank },
] as const;

const drawGrain = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shift: number,
): void => {
  ctx.fillStyle = WOOD.grain;
  for (let i = 0; i < GRAIN.length; i += 1) {
    const streak = GRAIN[(i + shift) % GRAIN.length];
    ctx.fillRect(
      x + Math.round(width * streak.from),
      Math.min(y + height - 1, Math.round(y + height * streak.y)),
      Math.round(width * (streak.to - streak.from)),
      1,
    );
  }
};

const drawPanel = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  // The frame is painted first and the timber laid inside it, so the edge
  // stays even even when the card's height is not a whole number of rows.
  const border = Math.max(2, Math.round(height / PANEL_ROWS));
  ctx.fillStyle = WOOD.outline;
  ctx.fillRect(0, 0, width, height);

  const x = border;
  const innerWidth = width - border * 2;
  const y = (rows: number): number => Math.round((rows / PANEL_ROWS) * height);

  BOARDS.forEach((board, index) => {
    const top = y(board.top);
    const boardHeight = y(board.bottom) - top;
    ctx.fillStyle = board.fill;
    ctx.fillRect(x, top, innerWidth, boardHeight);
    // Grain belongs to the boards; the seams between them stay clean.
    if (board.fill !== WOOD.seam) drawGrain(ctx, x, top, innerWidth, boardHeight, index);
  });
};

/**
 * Cuts the plank to the card's exact size, so it draws one-to-one with no
 * scaling artefacts. Called before the cards are laid out and again on every
 * resize that changes that size; a plank already the right shape is left
 * alone, so a resize that moves something else costs nothing.
 */
export const bakeWoodPanel = (scene: Phaser.Scene, width: number, height: number): void => {
  const w = Math.max(PANEL_ROWS * 2, Math.round(width));
  const h = Math.max(PANEL_ROWS, Math.round(height));

  const baked = scene.textures.exists(PANEL_KEY) ? scene.textures.get(PANEL_KEY) : null;
  if (baked) {
    if (baked.source[0].width === w && baked.source[0].height === h) return;
    scene.textures.remove(PANEL_KEY);
  }

  const texture = scene.textures.createCanvas(PANEL_KEY, w, h);
  if (!texture) return;
  drawPanel(texture.getContext(), w, h);
  texture.refresh();
};

/** The key to draw with, or null when no plank could be cut at all. */
export const woodPanelKey = (scene: Phaser.Scene): string | null =>
  scene.textures.exists(PANEL_KEY) ? PANEL_KEY : null;
