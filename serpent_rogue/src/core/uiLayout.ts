// uiLayout.ts — pure geometry for UI elements (buttons, HUD, cards, grid).
// Used by both the renderer (draws) and the game controller (hit-tests taps).

import { GRID, HUD, UI } from '../config/gameConfig.ts';
import type { Rect } from './types.ts';

export interface ResultButtons {
  restart: Rect;
  exit: Rect;
}

export interface HudLayout {
  baselineY: number;
  centerY: number;
  fontSize: number;
  hiFontSize: number;
  hiGap: number;
  textRight: number;
  pad: number;
}

export interface UpgradeCardLayout {
  cards: Rect[];
  reroll: Rect;
}

export function hudLayout(gw: number, top: number): HudLayout {
  const pad = Math.max(HUD.PAD_MIN, Math.round(gw * HUD.PAD_RATIO));
  const fontSize = Math.round(gw * HUD.FONT_RATIO);
  const baselineY = top + fontSize;

  return {
    baselineY,
    centerY: baselineY - fontSize * HUD.DIGIT_CENTER_RATIO,
    fontSize,
    hiFontSize: Math.round(fontSize * HUD.HI_FONT_RATIO),
    hiGap: Math.round(fontSize * HUD.HI_GAP_RATIO),
    textRight: gw - pad,
    pad,
  };
}

/** Play button on the Play Screen (AGENTS.md §2). */
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

/** Layout for the 3 upgrade cards + reroll button. */
export function upgradeCardLayout(gw: number, gh: number, cardCount: number): UpgradeCardLayout {
  const w = gw * UI.CARD_W_RATIO;
  const h = gh * UI.CARD_H_RATIO;
  const gap = gh * UI.CARD_GAP_RATIO;
  const startY = gh * UI.CARD_START_Y_RATIO;
  const cx = gw / 2;

  const cards: Rect[] = [];
  for (let i = 0; i < cardCount; i++) {
    cards.push({
      x: cx - w / 2,
      y: startY + i * (h + gap),
      w,
      h,
    });
  }

  const rw = gw * UI.REROLL_W_RATIO;
  const rh = gh * UI.REROLL_H_RATIO;
  const reroll: Rect = {
    x: cx - rw / 2,
    y: gh * UI.REROLL_Y_RATIO,
    w: rw,
    h: rh,
  };

  return { cards, reroll };
}

export function hitTest(rect: Rect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** Screen-safe top edge for HUD (AGENTS.md §3.1). */
export function topPadFor(screenH: number): number {
  return Math.max(Math.round(screenH * GRID.TOP_PAD_RATIO), GRID.TOP_PAD_MIN);
}

/** Compute the grid area within the playfield. */
export interface GridLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  cellSize: number;
  cols: number;
  rows: number;
}

export function gridLayout(gw: number, gh: number): GridLayout {
  const topPad = topPadFor(gh);
  const hudH = gh * GRID.HUD_HEIGHT_RATIO;
  const bottomPad = gh * GRID.BOTTOM_PAD_RATIO;

  const cellSize = Math.floor(gw / GRID.COLS);
  const cols = GRID.COLS;

  const gridW = cellSize * cols;
  const gridX = (gw - gridW) / 2;

  const gridTop = topPad + hudH;
  const availableH = gh - gridTop - bottomPad;
  const rows = Math.floor(availableH / cellSize);
  const gridH = cellSize * rows;
  const gridY = gridTop + (availableH - gridH) / 2;

  return { x: gridX, y: gridY, w: gridW, h: gridH, cellSize, cols, rows };
}
