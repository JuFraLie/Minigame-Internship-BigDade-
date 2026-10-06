import type { Vec2 } from '../core/types.ts';

/**
 * The mapping between the rendering world's screen space and the game world's
 * coordinate system.
 *
 * Owned by the rendering world (it reports the camera), consumed by the input
 * adapter. This port is the single place where a finger's screen delta becomes
 * a world delta - the simulation never sees a pixel (AGENTS.md A4.3).
 */
export interface ViewportPort {
  /**
   * The renderer reports the camera every frame. The camera translates and
   * zooms only: no rotation, no shear, so a delta is fully described by zoom.
   */
  updateCamera(scrollX: number, scrollY: number, zoom: number): void;

  /** Screen-space delta -> world-space delta. */
  screenDeltaToWorld(dx: number, dy: number): Vec2;
}
