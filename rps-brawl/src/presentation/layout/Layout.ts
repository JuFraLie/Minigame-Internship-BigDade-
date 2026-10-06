import type { Sign } from '../../core/types.ts';
import type { CardLayout, CardRegion } from '../../ports/CardLayoutPort.ts';
import { SIGNS } from '../../core/RpsRules.ts';

/**
 * The rendering world's geometry.
 *
 * Everything here is expressed in screen pixels of the *current* device, and
 * is recomputed whenever the canvas resizes. The game world never sees any of
 * it: the only bridge across the boundary is `GameLayout.cards`, which the
 * input adapter translates into picks.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface GameLayout {
  readonly width: number;
  readonly height: number;
  /** Global scale factor: 1 means "the 400 x 760 design size". */
  readonly unit: number;
  /** Keeps the HUD clear of status bars and display cutouts. */
  readonly topPad: number;
  readonly hud: {
    readonly heartsOrigin: Point;
    readonly heartGap: number;
    readonly heartSize: number;
    readonly score: Point;
    readonly multiplier: Point;
  };
  readonly enemy: {
    readonly center: Point;
    readonly radius: number;
  };
  readonly banner: Point;
  /** Screen-space hit regions of the three cards, in hand order. */
  readonly cards: CardLayout;
}

export interface PlayLayout {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly topPad: number;
  readonly titleY: number;
  readonly subtitleY: number;
  readonly hintY: number;
  readonly cardsY: number;
  readonly playY: number;
}

export interface ResultLayout {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly topPad: number;
  readonly titleY: number;
  readonly scoreLabelY: number;
  readonly scoreValueY: number;
  readonly streakLabelY: number;
  readonly streakValueY: number;
  readonly retryY: number;
  readonly exitY: number;
}

const REF_WIDTH = 400;
const REF_HEIGHT = 760;

/** Design size of a card texture; the scene scales it to the layout region. */
export const CARD_W = 108;
export const CARD_H = 150;
const CARD_GAP = 14;
const CARD_BOTTOM = 26;

const HUD_HEIGHT = 116;
const BANNER_OFFSET = 52;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Scale factor for the current screen; never lets elements get tiny or huge. */
export function unitFor(width: number, height: number): number {
  return clamp(Math.min(width / REF_WIDTH, height / REF_HEIGHT), 0.62, 2.4);
}

export function computeGameLayout(width: number, height: number): GameLayout {
  const unit = unitFor(width, height);
  const topPad = height * 0.08;

  // ── Cards, anchored to the thumb zone at the bottom ──
  const cardW = CARD_W * unit;
  const cardH = CARD_H * unit;
  const gap = CARD_GAP * unit;
  const totalW = SIGNS.length * cardW + (SIGNS.length - 1) * gap;
  const startX = (width - totalW) / 2;
  const cardsTop = height - CARD_BOTTOM * unit - cardH;

  const regions: CardRegion[] = SIGNS.map((sign: Sign, i) => ({
    sign,
    x: startX + i * (cardW + gap),
    y: cardsTop,
    width: cardW,
    height: cardH,
  }));

  // ── Enemy area: between the HUD and the banner ──
  const hudBottom = topPad + HUD_HEIGHT * unit;
  const bannerY = cardsTop - BANNER_OFFSET * unit;
  const areaTop = hudBottom + 24 * unit;
  const areaBottom = bannerY - 76 * unit;
  const centerY = (areaTop + areaBottom) / 2;
  const radius = Math.max(56 * unit, Math.min((areaBottom - areaTop) / 2, width * 0.28));

  return {
    width,
    height,
    unit,
    topPad,
    hud: {
      heartsOrigin: { x: 16 * unit, y: topPad + 26 * unit },
      heartGap: 38 * unit,
      // The heart box, not the drawing: the shape fills 35 of the 40px
      // texture, so this renders a ~30px heart — with air around it.
      heartSize: 34 * unit,
      score: { x: width / 2, y: topPad + 78 * unit },
      multiplier: { x: width - 16 * unit, y: topPad + 26 * unit },
    },
    enemy: {
      center: { x: width / 2, y: centerY },
      radius,
    },
    banner: { x: width / 2, y: bannerY },
    cards: { regions },
  };
}

/** Geometry of the Play Screen. */
export function computePlayLayout(width: number, height: number): PlayLayout {
  const unit = unitFor(width, height);
  return {
    width,
    height,
    unit,
    topPad: height * 0.08,
    titleY: height * 0.22,
    subtitleY: height * 0.305,
    hintY: height * 0.42,
    cardsY: height * 0.57,
    playY: height * 0.78,
  };
}

/** Geometry of the Result Panel. */
export function computeResultLayout(width: number, height: number): ResultLayout {
  const unit = unitFor(width, height);
  return {
    width,
    height,
    unit,
    topPad: height * 0.08,
    titleY: height * 0.26,
    scoreLabelY: height * 0.38,
    scoreValueY: height * 0.45,
    streakLabelY: height * 0.56,
    streakValueY: height * 0.625,
    retryY: height * 0.76,
    exitY: height * 0.76 + 74 * unit,
  };
}
