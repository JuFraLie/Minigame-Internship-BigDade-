// input.ts — pointer → game actions. Touch is the primary scheme (§3.2):
// tap = jump, swipe down = slide/shield. There is NO keyboard handling and NO
// mouse-specific path — the scenes forward Phaser's unified pointer events
// (PointerFeed) and touch and a desktop mouse arrive as the very same down/up
// transitions (§3.2 keeps mouse working only as that side-effect).
// It only translates events; it never decides what they mean for the game.

import type { ActionSource, InputAction, PointerFeed } from '../core/types.ts';

export class TouchInput implements ActionSource, PointerFeed {
  private pendingAction: InputAction = null;
  private startClientY: number | null = null;
  private readonly SWIPE_THRESHOLD = 40; // screen px

  /** Screen-space press: remember where the gesture started. */
  down(_clientX: number, clientY: number): void {
    this.startClientY = clientY;
  }

  /** Screen-space release: further down than the threshold slides,
   *  everything else — including a plain tap — jumps. */
  up(_clientX: number, clientY: number): void {
    // A release whose press landed in an already-finished scene (the player
    // held a finger across a scene change) counts as a tap, not as a swipe.
    const startY = this.startClientY ?? clientY;
    this.startClientY = null;
    this.pendingAction = clientY - startY > this.SWIPE_THRESHOLD ? 'slide' : 'jump';
  }

  /** Call once per frame (while playing) to consume the pending action. */
  consume(): InputAction {
    const action = this.pendingAction;
    this.pendingAction = null;
    return action;
  }
}
