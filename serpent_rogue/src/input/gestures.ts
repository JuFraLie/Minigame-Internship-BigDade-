// gestures.ts — pure gesture maths: which way a drag reads, and where a tap
// lands. No Phaser, no DOM and no rules, so it can be unit-tested headless
// (AGENTS.md §4.3, §4.4).
//
// The adapter measures the drag on the glass, converts it to world units and
// hands it over: nothing in here knows a pointer, and nothing in the rules
// knows that a swipe ever happened.

import type { Direction, Point } from '../core/types.ts';

/**
 * Reads one drag vector as a turn, or `null` while it is still shorter than
 * the threshold — a jittery press must never turn the snake.
 *
 * Diagonals resolve to the dominant axis, so a flick that is slightly off
 * horizontal still turns left/right the way the player meant. An exact tie
 * falls to the vertical axis (deterministic, so a test can pin it).
 */
export function swipeDirection(dx: number, dy: number, threshold: number): Direction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (ax < threshold && ay < threshold) return null;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  if (ay > ax) return dy > 0 ? 'down' : 'up';
  return dy > 0 ? 'down' : 'up';
}

/**
 * Keeps a released point inside the playfield.
 *
 * A finger often slides past the edge of the canvas before it lifts, which
 * would put the tap outside every button rectangle and silently miss it;
 * clamping makes a press that ends on (or beyond) an edge still land on the
 * control under it.
 */
export function clampToPlayfield(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  };
}
