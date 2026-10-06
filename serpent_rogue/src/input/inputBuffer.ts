// inputBuffer.ts — the input ports the rules engine drains, and the single
// place every input adapter writes into.
//
// Pure data structure: no Phaser, no DOM. Adapters (touch, keyboard) push into
// it, the scenes hand its ports to the headless controller, and the controller
// pulls once per frame or simulation step — so gameplay cannot tell where an
// input came from (AGENTS.md §4.3). Unit-tested without a renderer.

import type { Direction, DirectionSource, Point, PointerSource } from '../core/types.ts';

/** A direction port that never reports a turn. */
export const NONE_DIRECTION: DirectionSource = { consume: () => null };

/** A tap port that never reports a tap. */
export const NONE_TAP: PointerSource = { consume: () => null };

/**
 * Turns queued ahead of the simulation are capped at two: that is exactly what
 * the snake's own queue accepts, so a third could only delay the turn the
 * player is actually waiting for.
 */
const MAX_QUEUED_DIRECTIONS = 2;

export class InputBuffer {
  private directions: Direction[] = [];
  private tap: Point | null = null;
  private dash = false;

  /** Buffered turns, drained once per simulation step. */
  readonly direction: DirectionSource = {
    consume: (): Direction | null => this.directions.shift() ?? null,
  };

  /** Buffered taps in world coordinates, drained once per frame. */
  readonly taps: PointerSource = {
    consume: (): Point | null => {
      const tap = this.tap;
      this.tap = null;
      return tap;
    },
  };

  pushDirection(direction: Direction): void {
    if (this.directions.length >= MAX_QUEUED_DIRECTIONS) this.directions.shift();
    this.directions.push(direction);
  }

  pushTap(point: Point): void {
    this.tap = point;
  }

  pushDash(): void {
    this.dash = true;
  }

  /** Drain the dash gesture: a dash is a one-shot trigger, never a state. */
  consumeDash(): boolean {
    const dash = this.dash;
    this.dash = false;
    return dash;
  }
}
