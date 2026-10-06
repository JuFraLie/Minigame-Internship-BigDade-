import type { Vec2 } from '../../core/types.ts';
import type { InputPort, JoystickView } from '../../ports/InputPort.ts';
import type { KeyState, KeyboardPort } from '../../ports/KeyboardPort.ts';
import type { PointerPort } from '../../ports/PointerPort.ts';

/**
 * One move vector out of two ways to steer.
 *
 * Composed of ports, not of concrete adapters, so either half can be swapped
 * for another implementation without touching this file - the composition
 * root decides what actually gets plugged in (AGENTS.md section 4.3).
 *
 * Priority is deliberate: a held key always wins, and the drag takes over the
 * moment the keys go quiet. That keeps a thumb and a keyboard from being
 * averaged into a direction neither one asked for, and it means the stick is
 * still the drag's stick - the keyboard draws nothing on screen.
 */
export class CombinedInput implements InputPort, PointerPort, KeyboardPort {
  private readonly drag: InputPort & PointerPort;
  private readonly keys: InputPort & KeyboardPort;

  constructor(drag: InputPort & PointerPort, keys: InputPort & KeyboardPort) {
    this.drag = drag;
    this.keys = keys;
  }

  getMove(): Vec2 {
    const keyMove = this.keys.getMove();
    if (keyMove.x !== 0 || keyMove.y !== 0) return keyMove;
    return this.drag.getMove();
  }

  getStick(): JoystickView {
    return this.drag.getStick();
  }

  // --- PointerPort: every finger event belongs to the drag adapter ---------

  down(pointerId: number, x: number, y: number): void {
    this.drag.down(pointerId, x, y);
  }

  move(pointerId: number, x: number, y: number): void {
    this.drag.move(pointerId, x, y);
  }

  up(pointerId: number): void {
    this.drag.up(pointerId);
  }

  /** Drops the stick only - key state is polled every frame and stays owned by the keyboard. */
  releaseAll(): void {
    this.drag.releaseAll();
  }

  // --- KeyboardPort: the scene's held state goes to the keyboard half ------

  setHeld(state: KeyState): void {
    this.keys.setHeld(state);
  }
}
