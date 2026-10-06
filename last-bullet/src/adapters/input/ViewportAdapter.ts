import type { ViewportPort } from '../../ports/ViewportPort.ts';
import type { Vec2 } from '../../core/types.ts';

/**
 * `ViewportPort` implementation.
 *
 * The game camera translates and zooms - never rotates - so a screen delta
 * maps to a world delta by dividing out the zoom. Scroll is deliberately *not*
 * part of the conversion: it cancels out of a delta, which is exactly why a
 * drag means the same thing wherever the player happens to be standing.
 *
 * This is the single place where rendering coordinates become world
 * coordinates (AGENTS.md A4.3); the simulation never learns a screen exists.
 */
export class ViewportAdapter implements ViewportPort {
  private zoom = 1;
  private readonly out: Vec2 = { x: 0, y: 0 };

  updateCamera(_scrollX: number, _scrollY: number, zoom: number): void {
    // Scroll is read for symmetry with the renderer's report but cancels out.
    this.zoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  screenDeltaToWorld(dx: number, dy: number): Vec2 {
    this.out.x = dx / this.zoom;
    this.out.y = dy / this.zoom;
    return this.out;
  }
}
