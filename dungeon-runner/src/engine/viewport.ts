// viewport.ts — edge-to-edge geometry + screen→world coordinate mapping.
// Owns all DOM/geometry concerns for the screen; implements the game's Layout
// and GameSpace contracts so no other layer ever touches the DOM.
//
// §3.1: NO fixed aspect ratio. The playfield is the full container — any
// vertical screen height, edge-to-edge (the canvas bleeds behind the status
// bar / cutout). Top padding for the HUD comes from the safe-area inset plus
// the reserved top pad (core/uiLayout.ts → topPadFor).

import { LAYOUT } from '../config/gameConfig.ts';
import { topPadFor } from '../core/uiLayout.ts';
import type { GameSpace, Layout, Rect } from '../core/types.ts';

export class Viewport implements Layout, GameSpace {
  private readonly host: HTMLElement;
  private area: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private safeInsetTop = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.readSafeInset();
    this.resize();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    // Mobile toolbars collapse/expand the visual viewport without a window
    // resize — keep the world in sync with what the player can actually see.
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  /** Full-container playfield rectangle (edge-to-edge, no letterboxing). */
  get rect(): Rect {
    return { ...this.area };
  }

  get gameW(): number {
    return this.area.w;
  }

  get gameH(): number {
    return this.area.h;
  }

  /** Safe-area inset + reserved top pad — the HUD never starts at the raw
   *  top edge (§3.1). */
  get topInset(): number {
    return Math.round(this.safeInsetTop + topPadFor(this.area.h));
  }

  floorY(): number {
    return Math.round(this.area.h * LAYOUT.FLOOR_RATIO);
  }

  ceilY(): number {
    return Math.round(this.area.h * LAYOUT.CEIL_RATIO);
  }

  /** Height of the corridor the player runs through (floor − ceiling). */
  corridorH(): number {
    return this.floorY() - this.ceilY();
  }

  knightX(): number {
    return Math.round(this.area.w * LAYOUT.KNIGHT_X_RATIO);
  }

  /** Client (screen) coordinates → game-world coordinates (§4.3). */
  toGameX(clientX: number): number {
    return clientX - this.host.getBoundingClientRect().left;
  }

  toGameY(clientY: number): number {
    return clientY - this.host.getBoundingClientRect().top;
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    this.area = {
      x: 0,
      y: 0,
      w: Math.max(1, Math.round(rect.width)),
      h: Math.max(1, Math.round(rect.height)),
    };
  }

  /** Reads the safe-area inset exposed by style.css as `--sat-top`
   *  (env(safe-area-inset-top) with viewport-fit=cover in index.html). */
  private readSafeInset(): void {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--sat-top');
    const value = parseFloat(raw);
    this.safeInsetTop = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
}
