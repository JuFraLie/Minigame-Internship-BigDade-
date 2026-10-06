import type { Vec2 } from '../../core/types.ts';
import type { InputPort, JoystickView } from '../../ports/InputPort.ts';
import type { KeyState, KeyboardPort } from '../../ports/KeyboardPort.ts';
import type { ViewportPort } from '../../ports/ViewportPort.ts';

/**
 * The keyboard never draws a stick of its own, so it always reports this one.
 * The renderer reads it every frame; an inactive stick is simply hidden.
 */
const IDLE_STICK: JoystickView = {
  active: false,
  originX: 0,
  originY: 0,
  knobX: 0,
  knobY: 0,
};

/**
 * Keyboard steering: held directions in, a world move vector out.
 *
 * The key state arrives as screen directions - "D is down" is a statement
 * about the display, not about the arena - so the axis pair goes through
 * `ViewportPort` exactly like a drag delta does before it becomes a move.
 * A diagonal is normalised to one full step, the same cap a dragged stick
 * gets, so no key combination walks faster than a finger.
 *
 * Everything here is rewritten in place: a fixed-step driver that reads the
 * vector several times a frame allocates nothing.
 */
export class KeyboardMoveInput implements InputPort, KeyboardPort {
  private readonly viewport: ViewportPort;
  private readonly intent: Vec2 = { x: 0, y: 0 };

  // Plain field rather than a constructor parameter property: Node's
  // `--experimental-strip-types` cannot rewrite a parameter into a field.
  constructor(viewport: ViewportPort) {
    this.viewport = viewport;
  }

  setHeld(state: KeyState): void {
    const screenX = (state.right ? 1 : 0) - (state.left ? 1 : 0);
    const screenY = (state.down ? 1 : 0) - (state.up ? 1 : 0);

    if (screenX === 0 && screenY === 0) {
      this.intent.x = 0;
      this.intent.y = 0;
      return;
    }

    // Rendering coordinates become world coordinates exactly here.
    const world = this.viewport.screenDeltaToWorld(screenX, screenY);
    const length = Math.sqrt(world.x * world.x + world.y * world.y);
    if (length < 1e-6) {
      this.intent.x = 0;
      this.intent.y = 0;
      return;
    }

    this.intent.x = world.x / length;
    this.intent.y = world.y / length;
  }

  getMove(): Vec2 {
    return this.intent;
  }

  getStick(): JoystickView {
    return IDLE_STICK;
  }
}
