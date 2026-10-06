// playerInput.ts — the composed input: one facade the scenes talk to.
//
// All wiring lives here, outside the adapters and outside the rules
// (AGENTS.md §4.3): touch and keyboard write into a single buffer, and the
// scenes only ever see `direction`, `taps` and `consumeDash()`. Gameplay cannot
// tell — and is not allowed to care — whether a turn came from a finger or a
// key.

import type Phaser from 'phaser';
import type { DirectionSource, PointerSource } from '../core/types.ts';
import type { Viewport } from '../render/viewport.ts';
import { InputBuffer } from './inputBuffer.ts';
import { KeyboardInput } from './keyboardInput.ts';
import { TouchInput } from './touchInput.ts';

export class PlayerInput {
  private readonly buffer = new InputBuffer();
  private readonly touch: TouchInput;
  private readonly keyboard: KeyboardInput;

  /** Turns, drained once per simulation step. */
  readonly direction: DirectionSource;
  /** Taps in world coordinates, drained once per frame. */
  readonly taps: PointerSource;

  constructor(scene: Phaser.Scene, viewport: Viewport) {
    this.touch = new TouchInput(scene, viewport, this.buffer);
    this.keyboard = new KeyboardInput(scene, this.buffer);
    this.direction = this.buffer.direction;
    this.taps = this.buffer.taps;
    // The scene owns the lifetime: one listener, one teardown (a restart runs
    // `create` again and builds a fresh adapter).
    scene.events.once('shutdown', this.destroy, this);
  }

  /** Drain the dash gesture (double-tap on glass, Space on keyboard). */
  consumeDash(): boolean {
    return this.buffer.consumeDash();
  }

  destroy(): void {
    this.touch.destroy();
    this.keyboard.destroy();
  }
}
