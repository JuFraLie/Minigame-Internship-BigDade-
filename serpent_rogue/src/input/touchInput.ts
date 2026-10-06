// touchInput.ts — the touch (and mouse) adapter: turns Phaser pointer events
// into the shared input buffer (see inputBuffer.ts).
//
// Gestures are measured on the glass — a swipe threshold is a physical
// distance — and only then converted into playfield world coordinates, so
// gameplay ever sees game-world points (AGENTS.md §4.3). Nothing in this file
// knows a rule; nothing in the rules knows a pointer.
//
// The turn is read the moment the finger crosses the threshold instead of when
// it lifts: waiting for the release made every steering input a frame late and
// punished fast flicks, which only ever registered on `pointerup`.

import type Phaser from 'phaser';
import type { Direction, Point } from '../core/types.ts';
import type { Viewport } from '../render/viewport.ts';
import { clampToPlayfield, swipeDirection } from './gestures.ts';
import type { InputBuffer } from './inputBuffer.ts';

/** Swipe detection distance, in CSS pixels. */
const SWIPE_THRESHOLD_CSS_PX = 25;
/** Two pointer-downs closer than this in time count as a dash gesture. */
const DOUBLE_TAP_MS = 300;

export class TouchInput {
  /** The finger (or mouse button) the current gesture belongs to. */
  private pointerId: number | null = null;
  /** Where the current leg of the gesture started; a reported turn re-arms it. */
  private anchor: Point = { x: 0, y: 0 };
  /** The turn this gesture has already reported, if any. */
  private turned: Direction | null = null;
  private lastDownAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly viewport: Viewport,
    private readonly buffer: InputBuffer,
  ) {
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    // A finger released past the edge of the canvas reports `pointerupoutside`,
    // so both events have to finish the gesture: otherwise the adapter would
    // keep steering with a finger that has already left the glass.
    scene.input.on('pointerup', this.finish, this);
    scene.input.on('pointerupoutside', this.finish, this);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.finish, this);
    this.scene.input.off('pointerupoutside', this.finish, this);
    this.pointerId = null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    // Every press starts a fresh gesture. Adopting the new press (rather than
    // ignoring it while a gesture looks unfinished) is what keeps a missed
    // release — a cancelled touch — from wedging the input for the rest of the
    // session: the next finger always re-arms the adapter.
    this.pointerId = pointer.id;
    this.turned = null;
    this.anchor = this.toWorld(pointer);

    const now = performance.now();
    if (now - this.lastDownAt < DOUBLE_TAP_MS) {
      this.buffer.pushDash();
    }
    this.lastDownAt = now;
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.track(pointer);
  }

  private finish(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = null;

    // A flick can be over before `pointermove` ever reported it, so the
    // release position still gets its chance to turn the snake.
    this.track(pointer);

    // A gesture that turned is a swipe: only a press that never left the
    // threshold reads as a tap, so dragging across the Result Panel (or the
    // card overlay) can no longer press a button by accident.
    if (this.turned !== null) return;
    this.buffer.pushTap(
      clampToPlayfield(this.toWorld(pointer), this.viewport.gameW, this.viewport.gameH),
    );
  }

  /**
   * Turns the drag, if it has carried far enough, and ends the leg there.
   *
   * Re-anchoring on every reported turn is what lets one held finger steer
   * more than once: drag a threshold away, turn, drag a threshold further and
   * the next turn counts — while a slow straight drag keeps re-reporting the
   * same direction, which the rules queue ignores anyway.
   */
  private track(pointer: Phaser.Input.Pointer): void {
    const world = this.toWorld(pointer);
    const threshold = SWIPE_THRESHOLD_CSS_PX * this.viewport.unitsPerCssPixel();
    const direction = swipeDirection(world.x - this.anchor.x, world.y - this.anchor.y, threshold);
    if (!direction) return;

    this.anchor = world;
    if (direction === this.turned) return;
    this.turned = direction;
    this.buffer.pushDirection(direction);
  }

  /** Screen (backing-store) coordinates → playfield world coordinates. */
  private toWorld(pointer: Phaser.Input.Pointer): Point {
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: world.x, y: world.y };
  }
}
