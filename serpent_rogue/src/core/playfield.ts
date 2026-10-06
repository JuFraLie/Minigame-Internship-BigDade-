// playfield.ts — pure geometry: where the playfield sits on a screen of any
// size, and how logical game pixels map onto it. No DOM, so it stays testable.
//
// The build targets a portrait phone (9:16): the playfield is full height and
// at most VIEWPORT.MAX_ASPECT wide, centered horizontally.

import { VIEWPORT } from '../config/gameConfig.ts';
import type { Rect } from './types.ts';

/** Device rectangle the game is drawn into, plus its logical world size. */
export interface Playfield extends Rect {
  /** Logical → device pixel multiplier. */
  scale: number;
  /** Logical playfield width (game-world units the gameplay sees). */
  gameW: number;
  /** Logical playfield height — always VIEWPORT.DESIGN_H. */
  gameH: number;
}

/**
 * Fit the playfield into a screen of any size.
 */
export function fitPlayfield(screenW: number, screenH: number): Playfield {
  const h = Math.max(0, Math.round(screenH));
  const w = Math.max(0, Math.floor(Math.min(screenW, h * VIEWPORT.MAX_ASPECT)));
  const scale = h > 0 ? h / VIEWPORT.DESIGN_H : 1;

  return {
    x: (screenW - w) / 2,
    y: 0,
    w,
    h,
    scale,
    gameW: w / scale,
    gameH: VIEWPORT.DESIGN_H,
  };
}
