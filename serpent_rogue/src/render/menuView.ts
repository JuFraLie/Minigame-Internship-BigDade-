// menuView.ts — the Play Screen: title, PLAY button and the how-to lines.
//
// Geometry comes from core/uiLayout.ts — the same `playButton` rectangle the
// controller's tap-anywhere start uses — so the drawn button and the rules that
// govern this screen can never drift apart. The screen draws itself once; only
// the button's glow is repainted, and only while it pulses.

import type Phaser from 'phaser';
import { THEME } from '../config/gameConfig.ts';
import type { Layout, Rect } from '../core/types.ts';
import { playButton } from '../core/uiLayout.ts';
import { fillCss, parseColor } from './color.ts';
import { addText, baselineToCenter } from './text.ts';

// The Play Screen sits above the playfield and its HUD, the way the old canvas
// renderer painted its overlay over everything.
const DEPTH_OVERLAY = 30;
const DEPTH_GLOW = 31;
const DEPTH_TEXT = 32;

// Neon signage: a cyan plaque under a magenta pulse.
const BUTTON_COLOR = THEME.NEON_CYAN;
const GLOW_COLOR = parseColor(THEME.NEON_MAGENTA).rgb;

export class MenuView {
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly button: Rect;
  private readonly pulse: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layout: Layout) {
    const gw = layout.gameW;
    const gh = layout.gameH;
    const cx = gw / 2;

    this.button = playButton(gw, gh);

    this.overlay = scene.add.graphics().setDepth(DEPTH_OVERLAY);
    fillCss(this.overlay, THEME.OVERLAY);
    this.overlay.fillRect(0, 0, gw, gh);
    fillCss(this.overlay, BUTTON_COLOR);
    this.overlay.fillRoundedRect(this.button.x, this.button.y, this.button.w, this.button.h, 12);

    // The glow is its own Graphics so the pulse repaints one stroke instead of
    // the whole screen.
    this.pulse = scene.add.graphics().setDepth(DEPTH_GLOW);

    const titleSize = Math.round(gw * 0.105);
    this.texts.push(
      addText(scene, cx, baselineToCenter(gh * 0.28, titleSize), 'SERPENT', {
        fontFamily: 'sans-serif',
        fontSize: `${titleSize}px`,
        fontStyle: '900',
        color: THEME.NEON_CYAN,
        align: 'center',
        padding: { left: 24, right: 24, top: 16, bottom: 16 },
        shadow: { offsetX: 0, offsetY: 0, color: THEME.NEON_CYAN, blur: 16, fill: true },
      }).setOrigin(0.5),
    );

    const rogueSize = Math.round(gw * 0.08);
    this.texts.push(
      addText(scene, cx, baselineToCenter(gh * 0.36, rogueSize), 'ROGUE', {
        fontFamily: 'sans-serif',
        fontSize: `${rogueSize}px`,
        fontStyle: '900',
        color: THEME.NEON_MAGENTA,
        align: 'center',
        padding: { left: 24, right: 24, top: 16, bottom: 16 },
        shadow: { offsetX: 0, offsetY: 0, color: THEME.NEON_MAGENTA, blur: 12, fill: true },
      }).setOrigin(0.5),
    );

    const subtitleSize = Math.round(gw * 0.038);
    this.texts.push(
      addText(scene, cx, baselineToCenter(gh * 0.42, subtitleSize), 'Neon roguelike snake & upgrade builds', {
        fontFamily: 'sans-serif',
        fontSize: `${subtitleSize}px`,
        fontStyle: '600',
        color: THEME.TEXT_SECONDARY,
        align: 'center',
      }).setOrigin(0.5),
    );

    const playSize = Math.round(gw * 0.065);
    this.texts.push(
      addText(
        scene,
        cx,
        baselineToCenter(this.button.y + this.button.h * 0.66, playSize),
        'PLAY',
        {
          fontFamily: 'sans-serif',
          fontSize: `${playSize}px`,
          fontStyle: 'bold',
          color: THEME.TEXT_ON_NEON,
          align: 'center',
        },
      ).setOrigin(0.5),
    );

    // How-to: two short sentences, as required whenever the controls are not
    // self-evident (AGENTS.md §2).
    const howToSize = Math.round(gw * 0.036);
    for (const [line, y] of [
      ['Swipe to steer — double tap to dash once unlocked.', 0.65],
      ['Eat data chips to level up and craft your build.', 0.69],
    ] as const) {
      this.texts.push(
        addText(scene, cx, baselineToCenter(gh * y, howToSize), line, {
          fontFamily: 'sans-serif',
          fontSize: `${howToSize}px`,
          color: THEME.TEXT_SECONDARY,
          align: 'center',
        }).setOrigin(0.5),
      );
    }

    // Flavour, not a third instruction.
    const hintSize = Math.round(gw * 0.03);
    this.texts.push(
      addText(scene, cx, baselineToCenter(gh * 0.76, hintSize), 'The grid is always hungry.', {
        fontFamily: 'sans-serif',
        fontSize: `${hintSize}px`,
        color: THEME.TEXT_MUTED,
        align: 'center',
      }).setOrigin(0.5),
    );

    // The texts are created first in world order but belong above the overlay
    // (30) and the button glow (31) — otherwise the Play Screen's dimming layer
    // would swallow the title it is supposed to dim.
    for (const text of this.texts) text.setDepth(DEPTH_TEXT);
  }

  /** Repaints the button's pulsing outline. `pulse` is a phase in radians. */
  draw(pulse: number): void {
    const alpha = 0.8 + 0.2 * Math.sin(pulse);
    const { x, y, w, h } = this.button;

    this.pulse.clear();
    this.pulse.lineStyle(3, GLOW_COLOR, alpha);
    this.pulse.strokeRoundedRect(x, y, w, h, 12);
  }

  destroy(): void {
    this.overlay.destroy();
    this.pulse.destroy();
    for (const text of this.texts) text.destroy();
  }
}
