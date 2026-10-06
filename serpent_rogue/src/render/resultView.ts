// resultView.ts — the Result Panel: final score, run stats, the build summary
// and the Restart / Exit buttons.
//
// Button rectangles come from core/uiLayout.ts — the same `resultButtons`
// function the controller hit-tests taps against — so a button can never be
// drawn where it cannot be pressed (AGENTS.md §4.3: the view and the rules
// share geometry, never drawing code).

import type Phaser from 'phaser';
import { THEME } from '../config/gameConfig.ts';
import type { Layout, Rect } from '../core/types.ts';
import { resultButtons } from '../core/uiLayout.ts';
import type { Game } from '../game/game.ts';
import { fillCss, strokeCss } from './color.ts';
import { addText, baselineToCenter } from './text.ts';

const DEPTH = 30;
const OVERLAY_COLOR = THEME.OVERLAY;

export class ResultView {
  private readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, private readonly layout: Layout) {
    this.root = scene.add.container(0, 0).setDepth(DEPTH);
  }

  /** Paints the panel from the finalized run. Static: call once per show. */
  render(game: Game): void {
    const scene = this.root.scene;
    const gw = this.layout.gameW;
    const gh = this.layout.gameH;
    const cx = gw / 2;

    this.root.removeAll(true);

    const overlay = scene.add.graphics();
    fillCss(overlay, OVERLAY_COLOR);
    overlay.fillRect(0, 0, gw, gh);
    this.root.add(overlay);

    const titleSize = Math.round(gw * 0.09);
    this.root.add(
      addText(scene, cx, baselineToCenter(gh * 0.22, titleSize), 'RUN COMPLETE', {
        fontFamily: 'sans-serif',
        fontSize: `${titleSize}px`,
        fontStyle: 'bold',
        color: THEME.NEON_MAGENTA,
        align: 'center',
      }).setOrigin(0.5),
    );

    const scoreSize = Math.round(gw * 0.065);
    this.root.add(
      addText(
        scene,
        cx,
        baselineToCenter(gh * 0.3, scoreSize),
        `SCORE ${Math.floor(game.score).toString().padStart(5, '0')}`,
        {
          fontFamily: 'monospace',
          fontSize: `${scoreSize}px`,
          fontStyle: 'bold',
          color: THEME.TEXT_PRIMARY,
          align: 'center',
        },
      ).setOrigin(0.5),
    );

    const bestSize = Math.round(gw * 0.038);
    this.root.add(
      addText(scene, cx, baselineToCenter(gh * 0.35, bestSize), `BEST  ${Math.floor(game.hiScore).toString().padStart(5, '0')}`, {
        fontFamily: 'monospace',
        fontSize: `${bestSize}px`,
        color: THEME.TEXT_SECONDARY,
        align: 'center',
      }).setOrigin(0.5),
    );

    if (game.isNewHi) {
      const newHiSize = Math.round(gw * 0.04);
      this.root.add(
        addText(scene, cx, baselineToCenter(gh * 0.4, newHiSize), '★ NEW BEST! ★', {
          fontFamily: 'sans-serif',
          fontSize: `${newHiSize}px`,
          fontStyle: 'bold',
          color: THEME.NEON_YELLOW,
          align: 'center',
        }).setOrigin(0.5),
      );
    }

    const statsSize = Math.round(gw * 0.038);
    this.root.add(
      addText(
        scene,
        cx,
        baselineToCenter(gh * 0.46, statsSize),
        `Stage Reached: ${game.stageManager.currentStage}   •   Chips Eaten: ${game.totalFoodEaten}`,
        {
          fontFamily: 'sans-serif',
          fontSize: `${statsSize}px`,
          fontStyle: '600',
          color: THEME.TEXT_SECONDARY,
          align: 'center',
        },
      ).setOrigin(0.5),
    );

    const headerSize = Math.round(gw * 0.032);
    this.root.add(
      addText(scene, cx, baselineToCenter(gh * 0.52, headerSize), 'MODULES INSTALLED:', {
        fontFamily: 'sans-serif',
        fontSize: `${headerSize}px`,
        fontStyle: 'bold',
        color: THEME.TEXT_MUTED,
        align: 'center',
      }).setOrigin(0.5),
    );

    const listSize = Math.round(gw * 0.032);
    if (game.chosenUpgrades.length === 0) {
      this.root.add(
        addText(scene, cx, baselineToCenter(gh * 0.56, listSize), 'None chosen', {
          fontFamily: 'sans-serif',
          fontSize: `${listSize}px`,
          fontStyle: 'italic',
          color: THEME.TEXT_MUTED,
          align: 'center',
        }).setOrigin(0.5),
      );
    } else {
      const displayList = game.chosenUpgrades.map((u) => u.replace(/_/g, ' ')).join(', ');
      this.root.add(
        addText(scene, cx, baselineToCenter(gh * 0.56, listSize), displayList, {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(gw * 0.028)}px`,
          fontStyle: '500',
          color: THEME.NEON_GREEN,
          align: 'center',
          wordWrap: { width: gw * 0.8, useAdvancedWrap: true },
        }).setOrigin(0.5, 0),
      );
    }

    const { restart, exit } = resultButtons(gw, gh);
    this.drawButton(restart, 'RESTART', THEME.NEON_CYAN, THEME.TEXT_ON_NEON, gw);
    this.drawButton(exit, 'EXIT', THEME.NEON_MAGENTA, THEME.TEXT_ON_NEON, gw);
  }

  destroy(): void {
    this.root.removeAll(true);
    this.root.destroy();
  }

  private drawButton(rect: Rect, label: string, fill: string, textColor: string, gw: number): void {
    const scene = this.root.scene;

    const body = scene.add.graphics();
    fillCss(body, fill);
    body.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    strokeCss(body, 'rgba(255, 255, 255, 0.3)', 1.5);
    body.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    this.root.add(body);

    const labelSize = Math.round(gw * 0.044);
    this.root.add(
      addText(
        scene,
        rect.x + rect.w / 2,
        baselineToCenter(rect.y + rect.h * 0.65, labelSize),
        label,
        {
          fontFamily: 'sans-serif',
          fontSize: `${labelSize}px`,
          fontStyle: 'bold',
          color: textColor,
          align: 'center',
        },
      ).setOrigin(0.5),
    );
  }
}
