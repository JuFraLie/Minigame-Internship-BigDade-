// keyboardInput.ts — desktop keyboard adapter: WASD / arrow keys steer, Space
// dashes.
//
// The game ships into a mobile WebView where touch is the scheme (AGENTS.md
// §3.2); this adapter exists so the same build is also playable with a keyboard
// on a desktop, for review and for automated checks. It only translates key
// events into the shared input buffer — no rule, no coordinate and no renderer
// is visible here (AGENTS.md §4.3).

import type Phaser from 'phaser';
import type { Direction } from '../core/types.ts';
import type { InputBuffer } from './inputBuffer.ts';

/** Keys that steer, matched case-insensitively against `KeyboardEvent.key`. */
const STEER_KEYS: Record<string, Direction> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

/** Space / Enter trigger the dash, mirroring the double-tap gesture. */
const DASH_KEYS = new Set([' ', 'spacebar', 'enter']);

export class KeyboardInput {
  private readonly onKey: (event: KeyboardEvent) => void;
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;

  constructor(scene: Phaser.Scene, buffer: InputBuffer) {
    // The keyboard plugin can legitimately be absent (a host that disables
    // keyboard input): the game then stays touch-only instead of failing.
    this.keyboard = scene.input.keyboard ?? null;
    this.onKey = (event: KeyboardEvent): void => this.handle(event, buffer);
    this.keyboard?.on('keydown', this.onKey);
  }

  destroy(): void {
    this.keyboard?.off('keydown', this.onKey);
  }

  private handle(event: KeyboardEvent, buffer: InputBuffer): void {
    // Browser shortcuts and auto-repeat are not game input: swallowing Ctrl+W
    // or queueing a turn per repeat tick would both be wrong.
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;

    const key = event.key.toLowerCase();
    const direction = STEER_KEYS[key];

    if (direction) {
      // Arrows and Space scroll the page by default; this game has no page to
      // scroll, so the default action belongs to the game instead.
      event.preventDefault();
      buffer.pushDirection(direction);
      return;
    }

    if (DASH_KEYS.has(key)) {
      event.preventDefault();
      buffer.pushDash();
    }
  }
}
