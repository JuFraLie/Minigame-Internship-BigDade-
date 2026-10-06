import type { Vec2 } from '../core/types.ts';

/**
 * Where the floating joystick is drawn, in screen space.
 *
 * Owned by the input adapter and rewritten in place, so the HUD can read it
 * every frame without allocating.
 */
export interface JoystickView {
  /** False when no finger is down: the HUD hides the stick. */
  active: boolean;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

/**
 * Inbound move intent, already in game-world coordinates.
 *
 * Implemented by the touch adapter. The screen-to-world conversion happens in
 * the adapter, so the simulation never learns that a screen exists.
 */
export interface InputPort {
  /**
   * Normalised drag direction, magnitude 0 (finger still) to 1 (dragged past
   * the dead zone). Never null: an idle finger reads as `{0, 0}`.
   *
   * The returned object is owned by the implementation and is rewritten in
   * place - read it, do not retain it.
   */
  getMove(): Vec2;

  /** The stick's screen-space geometry, for the renderer to draw. */
  getStick(): JoystickView;
}
