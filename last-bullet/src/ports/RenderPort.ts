import type { WorldFrame } from '../core/types.ts';

/**
 * The renderer's read-only window onto the game world.
 *
 * Implemented by `GameWorld`, consumed by the HUD, the world view and the
 * overlays. It is a *pull* port: nothing is pushed at the renderer, and the
 * renderer may look but never touch.
 */
export interface RenderPort {
  /**
   * The current frame. The returned object and its arrays are reused in place
   * and are only valid until the next simulation step.
   */
  getFrame(): WorldFrame;
}
