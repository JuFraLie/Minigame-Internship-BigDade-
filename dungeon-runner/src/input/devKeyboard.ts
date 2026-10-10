// devKeyboard.ts — DEV-ONLY keyboard shim for testing on a laptop browser.
//
// The shipped game is touch-only (§3.2): no keyboard handling may exist in the
// release build. This module is instantiated ONLY behind `import.meta.env.DEV`
// in bootstrap.ts — Vite replaces that flag with `false` at bundle time and
// the minifier drops the whole branch, so the release `dist/` contains zero
// keyboard listeners (verified by grepping the bundle for `keydown`).
//
// It mirrors the old desktop mapping: W / Space / ArrowUp = jump,
// S / ArrowDown = shield. Every press also fires `onAnyInput`, which the
// composition root wires to `game.handlePlay()` — the same "any input starts
// the run" path the Play Screen offers to fingers.

import type { ActionSource, InputAction } from '../core/types.ts';

const JUMP_KEYS = new Set(['w', ' ', 'arrowup']);
const SHIELD_KEYS = new Set(['s', 'arrowdown']);

export class DevKeyboardInput implements ActionSource {
  private pendingAction: InputAction = null;
  private attached = false;

  /** Fired on any mapped key — the Play Screen listens to this to begin a run. */
  onAnyInput?: () => void;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    const isJump = JUMP_KEYS.has(key);
    const isShield = SHIELD_KEYS.has(key);
    if (!isJump && !isShield) return;

    e.preventDefault(); // Space / arrows must not scroll or activate anything

    this.onAnyInput?.();

    // A held jump key jumps once per press; a held shield key auto-repeats, so
    // keeping S down keeps the shield refreshed after it drops.
    if (isJump && e.repeat) return;
    this.pendingAction = isJump ? 'jump' : 'slide';
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** Call once per frame (while playing) to consume the pending action. */
  consume(): InputAction {
    const action = this.pendingAction;
    this.pendingAction = null;
    return action;
  }
}
