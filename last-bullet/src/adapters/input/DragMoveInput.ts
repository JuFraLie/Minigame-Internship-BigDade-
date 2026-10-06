import type { Vec2 } from '../../core/types.ts';
import type { InputPort, JoystickView } from '../../ports/InputPort.ts';
import type { PointerPort } from '../../ports/PointerPort.ts';
import type { ViewportPort } from '../../ports/ViewportPort.ts';

/** Screen radius of the ring the knob is clamped to. */
const STICK_RADIUS = 76;
/** Below this the thumb is resting, not steering. */
const DEAD_ZONE = 12;
/** Screen distance at which the drag reads as full speed. */
const FULL_AT = 48;

/**
 * Floating-joystick input: screen-space drags in, world-space move out.
 *
 * The origin follows the finger that went down, so the stick literally appears
 * under the thumb. Two conversions happen here and nowhere else:
 *
 *  - screen delta -> world delta, through `ViewportPort` (AGENTS.md A4.3),
 *  - drag distance -> a 0..1 magnitude, past a small dead zone.
 *
 * The move vector is a stable object rewritten in place, so stepping at 30 Hz
 * allocates nothing.
 */
export class DragMoveInput implements InputPort, PointerPort {
  private pointerId = -1;
  /** Stable object handed out by `getMove`; rewritten in place every drag. */
  private readonly intent: Vec2 = { x: 0, y: 0 };
  private readonly stick: JoystickView = {
    active: false,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
  };

  private readonly viewport: ViewportPort;

  // A plain field rather than a constructor parameter property: Node's
  // `--experimental-strip-types` only erases types and cannot rewrite a
  // parameter into a field assignment.
  constructor(viewport: ViewportPort) {
    this.viewport = viewport;
  }

  down(pointerId: number, x: number, y: number): void {
    // One thumb only: a second finger must not steal the stick.
    if (this.pointerId !== -1) return;

    this.pointerId = pointerId;
    this.stick.active = true;
    this.stick.originX = x;
    this.stick.originY = y;
    this.stick.knobX = x;
    this.stick.knobY = y;
    this.intent.x = 0;
    this.intent.y = 0;
  }

  move(pointerId: number, x: number, y: number): void {
    if (pointerId !== this.pointerId) return;

    const dx = x - this.stick.originX;
    const dy = y - this.stick.originY;
    const screenDist = Math.sqrt(dx * dx + dy * dy);

    const clamped = screenDist > STICK_RADIUS ? STICK_RADIUS / screenDist : 1;
    this.stick.knobX = this.stick.originX + dx * clamped;
    this.stick.knobY = this.stick.originY + dy * clamped;

    if (screenDist < DEAD_ZONE) {
      this.intent.x = 0;
      this.intent.y = 0;
      return;
    }

    // Rendering coordinates become world coordinates exactly here.
    const world = this.viewport.screenDeltaToWorld(dx, dy);
    const worldDist = Math.sqrt(world.x * world.x + world.y * world.y);
    if (worldDist < 1e-6) {
      this.intent.x = 0;
      this.intent.y = 0;
      return;
    }

    const magnitude = Math.min(1, (screenDist - DEAD_ZONE) / (FULL_AT - DEAD_ZONE));
    this.intent.x = (world.x / worldDist) * magnitude;
    this.intent.y = (world.y / worldDist) * magnitude;
  }

  up(pointerId: number): void {
    if (pointerId !== this.pointerId) return;
    this.releaseAll();
  }

  releaseAll(): void {
    this.pointerId = -1;
    this.stick.active = false;
    this.intent.x = 0;
    this.intent.y = 0;
  }

  getMove(): Vec2 {
    return this.intent;
  }

  getStick(): JoystickView {
    return this.stick;
  }
}
