import type Phaser from 'phaser';

/**
 * The game's light-timber UI, *drawn* rather than shipped: the level-up card,
 * and - through `bakePlank` - the Play button and the pause sign. Nothing to
 * fetch and nothing to 404 (AGENTS.md A3.4), the same rule the bullets and
 * the hearts follow in `TextureGenerator`.
 *
 * A plank is 27 rows: outline / header / seam / field / seam / footer /
 * outline. The card lays every label against those bands; anything else
 * centres its text on the field, which is 13 of the 27 rows and therefore the
 * exact middle of the board. One cutter serves both jobs.
 *
 * Bands are fractions of the height, and the bake derives its pixel
 * boundaries from the same rows, so grain, seams and text cannot drift apart
 * when a resize recuts the plank.
 */

/** Texture key of the level-up card's plank, cut in `GameScene.applyLayout`. */
export const PANEL_KEY = 'wood_panel';

/** How a plank's 27 rows are spent. */
const ROWS = {
  /** Carved frame, top and bottom. */
  edge: 1,
  /** The board the card's title sits on. */
  header: 5,
  /** The pale bead between two boards. */
  seam: 1,
  /** The palest board: the card's blurb, and the middle of any button. */
  field: 13,
  /** The board the rarity tag sits on. */
  footer: 5,
} as const;

/** Rows a plank is cut from: outline + boards + outline. */
export const PANEL_ROWS =
  ROWS.edge + ROWS.header + ROWS.seam + ROWS.field + ROWS.seam + ROWS.footer + ROWS.edge;

/** Rows of the pale middle board - what a plank must be tall enough to carry. */
export const FIELD_ROWS = ROWS.field;

const HEADER_Y = ROWS.edge;
const FIELD_Y = ROWS.edge + ROWS.header + ROWS.seam;
const FOOTER_Y = FIELD_Y + ROWS.field + ROWS.seam;

/**
 * Centre of each band as a fraction of the plank's height. `LevelUpOverlay`
 * puts its lines here; the bake paints the bands from the same rows.
 */
export const PANEL_BAND = {
  header: (HEADER_Y + ROWS.header / 2) / PANEL_ROWS,
  body: (FIELD_Y + ROWS.field / 2) / PANEL_ROWS,
  footer: (FOOTER_Y + ROWS.footer / 2) / PANEL_ROWS,
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
 *    plank off whatever is dimmed behind it;
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
 * Grain spans, as fractions of the board they sit in. Fixed rather than
 * random: the plank is recut on every resize, and random grain would flicker
 * a new pattern each time the phone moved. The spans are uneven on purpose -
 * evenly spaced lines read as scanlines, not as timber.
 */
const GRAIN = [
  { y: 0.22, from: 0.05, to: 0.72 },
  { y: 0.51, from: 0.34, to: 0.96 },
  { y: 0.79, from: 0.13, to: 0.55 },
] as const;

/** An identity bar down a plank's left edge - what an action wears. */
export interface PlankAccent {
  /** Palette colour, taken the way a rectangle takes it. */
  readonly color: number;
  /** Width in pixels: the caller has the screen unit, the plank does not. */
  readonly width: number;
}

/** Boards, `[first, lastExclusive)` of `PANEL_ROWS`, in the order they lie. */
const BOARDS = [
  { top: HEADER_Y, bottom: HEADER_Y + ROWS.header, fill: WOOD.plank },
  { top: HEADER_Y + ROWS.header, bottom: FIELD_Y, fill: WOOD.seam },
  { top: FIELD_Y, bottom: FIELD_Y + ROWS.field, fill: WOOD.field },
  { top: FIELD_Y + ROWS.field, bottom: FOOTER_Y, fill: WOOD.seam },
  { top: FOOTER_Y, bottom: PANEL_ROWS - ROWS.edge, fill: WOOD.plank },
] as const;

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

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

const drawPanel = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent?: PlankAccent,
): void => {
  // The frame is painted first and the timber laid inside it, so the edge
  // stays even even when the height is not a whole number of rows.
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

  if (accent) {
    // Painted last, over the frame - where a card wears its own stripe. The
    // accent is `accent.width` of colour; the dark line around it is the
    // plank's own frame, redrawn so the bar reads as carved, not stuck on.
    const frame = Math.max(1, Math.round(border / 2));
    const bar = frame * 2 + Math.max(2, accent.width);
    ctx.fillStyle = WOOD.outline;
    ctx.fillRect(0, 0, bar, height);
    ctx.fillStyle = css(accent.color);
    ctx.fillRect(frame, frame, bar - frame * 2, height - frame * 2);
  }
};

/**
 * Cuts a plank of the given size under `key`, so it draws one-to-one with no
 * scaling artefacts. A plank already that shape is left alone, so a resize
 * that moves something else costs nothing; one that changed size is recut.
 *
 * A key's plank is fixed in *colour* as well as shape - callers bake once per
 * layout with the same accent - because recutting to a new size is the only
 * case this function bothers to redraw.
 */
export const bakePlank = (
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  accent?: PlankAccent,
): void => {
  const w = Math.max(PANEL_ROWS * 2, Math.round(width));
  const h = Math.max(PANEL_ROWS, Math.round(height));

  const baked = scene.textures.exists(key) ? scene.textures.get(key) : null;
  if (baked) {
    if (baked.source[0].width === w && baked.source[0].height === h) return;
    scene.textures.remove(key);
  }

  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return;
  drawPanel(texture.getContext(), w, h, accent);
  texture.refresh();
};

/**
 * The level-up card's plank: one key, because every card's labels are laid
 * out against it. Cut in `GameScene.applyLayout`, once per layout.
 */
export const bakeWoodPanel = (scene: Phaser.Scene, width: number, height: number): void => {
  bakePlank(scene, PANEL_KEY, width, height);
};

/** The card's key to draw with, or null when no plank could be cut at all. */
export const woodPanelKey = (scene: Phaser.Scene): string | null =>
  scene.textures.exists(PANEL_KEY) ? PANEL_KEY : null;
