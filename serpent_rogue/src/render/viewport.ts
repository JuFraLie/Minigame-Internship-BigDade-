// render/viewport.ts — everything that reads the device: window measurement,
// backing-store density, and the camera setup that keeps world coordinates in
// design units. The playfield maths itself stays pure in core/playfield.ts.
//
// Implements the game's `Layout` port, so gameplay and every screen can ask
// "how big is the playfield?" without touching the DOM.

import type Phaser from 'phaser';
import { fitPlayfield, type Playfield } from '../core/playfield.ts';
import type { Layout } from '../core/types.ts';

/**
 * Backing-store density, capped at 2: past that a Helio G95-class device only
 * loses frames.
 *
 * It is sampled once, at launch, and kept for the whole session: the canvas
 * backing store is `renderScale()` times the design size, so re-reading it later
 * (browser zoom, DevTools device emulation) would aim the camera at a canvas
 * built for a different density and draw the world at the wrong size.
 *
 * The value lives in memory for the launch only — no storage of any kind.
 */
let density: number | null = null;

export function renderScale(): number {
  if (density === null) {
    density = Math.min(window.devicePixelRatio || 1, 2);
  }
  return density;
}

/**
 * Event name emitted on `game.events` once the canvas has adopted a new design
 * size. Screens rebuild their layout when they hear it, which is what keeps a
 * window resize (rotation, split screen, a WebView that settles late) from
 * pushing the HUD off-screen.
 */
export const VIEWPORT_CHANGED = 'viewportChanged';

/**
 * Every camera zooms back by `renderScale()` with a top-left origin, which keeps
 * world coordinates in design units while the backing store stays sharp.
 *
 * `setOrigin(0, 0)` is not cosmetic: `Camera.preRender` builds its matrix as
 * `origin + zoom * (point - origin)`, so with the default 0.5 origin the world
 * point 0 would land off-canvas once zoomed. Anchoring the origin top-left
 * reduces the mapping to `zoom * point`, which is the design-space layout this
 * game uses.
 */
export function applyRenderScale(scene: Phaser.Scene): void {
  const camera = scene.cameras.main;
  camera.setOrigin(0, 0);
  camera.setZoom(renderScale());
}

export class Viewport implements Layout {
  private field: Playfield = fitPlayfield(window.innerWidth, window.innerHeight);

  /** Re-reads the window. Called before the canvas is resized so every layer
   *  measures the same space the canvas is about to describe. */
  measure(): void {
    this.field = fitPlayfield(window.innerWidth, window.innerHeight);
  }

  /**
   * Logical playfield width — the space gameplay and every screen lay out in.
   * Rounded so the canvas (`gameW * renderScale()`), the camera and the hit
   * tests all describe exactly the same rectangle.
   */
  get gameW(): number {
    return Math.max(1, Math.round(this.field.gameW));
  }

  /** Logical playfield height — always VIEWPORT.DESIGN_H. */
  get gameH(): number {
    return this.field.gameH;
  }

  /**
   * Logical units per CSS pixel. The playfield spans the full window height, so
   * this is what converts a gesture measured on the glass (swipe thresholds are
   * physical distances) into the world space input hands to gameplay.
   */
  unitsPerCssPixel(): number {
    return this.gameH / Math.max(1, window.innerHeight);
  }
}
