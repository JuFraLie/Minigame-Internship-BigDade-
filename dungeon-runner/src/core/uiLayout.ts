// uiLayout.ts — pure geometry for the result-screen buttons.
// Lives in core because BOTH sides need it: the renderer draws these rects and
// the game controller hit-tests taps against them. Keeping one definition means
// the clickable area can never drift away from the drawn button.

import { HEALTH, HUD, LAYOUT, UI } from '../config/gameConfig.ts';
import type { Rect } from './types.ts';

export interface ResultButtons {
  restart: Rect;
  exit: Rect;
}

/**
 * Geometry of the in-run HUD: a SINGLE row.
 *
 * The hearts (left) and the score (right) are both placed from one shared
 * `centerY`, which is the optical centre of the digits — health and score sit
 * at the same height, never on two rows. The HI score rides the same
 * `baselineY`, just smaller and grey, and the coin count follows the hearts
 * on that same line.
 */
export interface HudLayout {
  /** Text baseline — every piece of HUD text hangs from this line. */
  baselineY: number;
  /** Optical centre of the digits; the hearts are centred on this line. */
  centerY: number;
  /** Score font size in px. */
  fontSize: number;
  /** HI score font size in px — smaller, on the same baseline. */
  hiFontSize: number;
  /** Gap in px between the HI block and the score. */
  hiGap: number;
  /** Right edge that the score and HI score are right-aligned to. */
  textRight: number;
  /** Side padding in px. */
  pad: number;
  /** Heart size in px (the path itself is a bit larger than this). */
  heartSize: number;
  /** Distance between two heart centres in px. */
  heartSpacing: number;
  /** Centre of the first heart in px. */
  firstHeartX: number;
  /** Centre of the coin icon in px — right of the hearts, same centre line. */
  coinX: number;
  /** Radius of the coin icon in px. */
  coinRadius: number;
  /** Coin count font size in px — smaller than the score, on the same line. */
  coinFontSize: number;
  /** Left edge the coin count text starts at, in px. */
  coinTextX: number;
}

export function hudLayout(gw: number, top: number): HudLayout {
  const pad = Math.max(HUD.PAD_MIN, Math.round(gw * HUD.PAD_RATIO));
  const fontSize = Math.round(gw * HUD.FONT_RATIO);
  const baselineY = top + fontSize;
  const heartSize = fontSize * HUD.HEART_SIZE_RATIO;
  const heartSpacing = heartSize * HUD.HEART_SPACING;
  const firstHeartX = pad + heartSize;

  // The coins sit after the hearts block, so the row can never be clipped by
  // the score: tests/uiLayout.test.ts checks this against every portrait size.
  const heartsRight = firstHeartX + (HEALTH.MAX_HEARTS - 1) * heartSpacing + heartSize;
  const coinRadius = fontSize * HUD.COIN_SIZE_RATIO;
  const coinX = heartsRight + fontSize * HUD.COIN_GAP_RATIO + coinRadius;

  return {
    baselineY,
    centerY: baselineY - fontSize * HUD.DIGIT_CENTER_RATIO,
    fontSize,
    hiFontSize: Math.round(fontSize * HUD.HI_FONT_RATIO),
    hiGap: Math.round(fontSize * HUD.HI_GAP_RATIO),
    textRight: gw - pad,
    pad,
    heartSize,
    heartSpacing,
    firstHeartX,
    coinX,
    coinRadius,
    coinFontSize: Math.round(fontSize * HUD.COIN_FONT_RATIO),
    coinTextX: coinX + coinRadius + Math.round(fontSize * 0.2),
  };
}

/**
 * Play button on the Play Screen (AGENTS.md §2: a Play button MUST be present).
 * A tap anywhere on that screen starts the run, so this rect is the drawn
 * affordance rather than a hit-test target.
 */
export function playButton(gw: number, gh: number): Rect {
  const w = gw * UI.PLAY_W_RATIO;
  const h = gh * UI.PLAY_H_RATIO;
  return { x: (gw - w) / 2, y: gh * UI.PLAY_Y_RATIO, w, h };
}

export function resultButtons(gw: number, gh: number): ResultButtons {
  const w = gw * UI.BUTTON_W_RATIO;
  const h = gh * UI.BUTTON_H_RATIO;
  const y = gh * UI.BUTTON_Y_RATIO;
  const gap = gw * UI.BUTTON_GAP_RATIO;
  const cx = gw / 2;

  return {
    restart: { x: cx - w - gap / 2, y, w, h },
    exit: { x: cx + gap / 2, y, w, h },
  };
}

export function hitTest(rect: Rect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/**
 * Screen-safe top edge for HUD and menu text (AGENTS.md §3.1): a percentage of
 * the screen height, but never so small that a status bar swallows the UI.
 */
export function topPadFor(screenH: number): number {
  return Math.max(Math.round(screenH * LAYOUT.TOP_PAD_RATIO), LAYOUT.TOP_PAD_MIN);
}
