// pointer.ts — raw taps, converted from screen space into game-world
// coordinates through the GameSpace port before they reach any consumer
// (§4.3). Separate from TouchInput because taps mean two different things:
// gameplay actions (jump/slide) while a run is active, menu/button presses
// while it is not. The scenes forward Phaser's unified pointer events here;
// touch is the primary scheme (§3.2) and a tap is recorded on release.

import type { GameSpace, Point, PointerFeed, PointerSource } from '../core/types.ts';

export class TouchPointer implements PointerSource, PointerFeed {
  private readonly space: GameSpace;
  private tap: Point | null = null;

  constructor(space: GameSpace) {
    this.space = space;
  }

  /** Presses produce nothing — a tap exists only once the pointer is
   *  released, exactly like the touchend event this replaced. */
  down(_clientX: number, _clientY: number): void {}

  /** Screen-space release → world-space tap, via GameSpace (§4.3). */
  up(clientX: number, clientY: number): void {
    this.tap = { x: this.space.toGameX(clientX), y: this.space.toGameY(clientY) };
  }

  consume(): Point | null {
    const tap = this.tap;
    this.tap = null;
    return tap;
  }
}
