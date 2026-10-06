// upgradeView.ts — the level-up overlay: banner, the three upgrade cards and
// the reroll button.
//
// Card rectangles come from core/uiLayout.ts, the same function the controller
// hit-tests taps against, so a card can never be drawn where it cannot be
// picked. The overlay is rebuilt only when the offered cards or the reroll count
// change — it is static while the player reads it.

import type Phaser from 'phaser';
import { THEME, UPGRADES } from '../config/gameConfig.ts';
import type { Layout } from '../core/types.ts';
import { upgradeCardLayout, type UpgradeCardLayout } from '../core/uiLayout.ts';
import type { Game } from '../game/game.ts';
import type { Upgrade } from '../game/upgrades.ts';
import { fillCss, strokeCss } from './color.ts';
import { addText, baselineToCenter } from './text.ts';

const DEPTH = 30;
const OVERLAY_COLOR = THEME.OVERLAY;

export class UpgradeView {
  private readonly root: Phaser.GameObjects.Container;
  private key = '';

  constructor(scene: Phaser.Scene, private readonly layout: Layout) {
    this.root = scene.add.container(0, 0).setDepth(DEPTH);
  }

  /** Shows the overlay for the current offer, rebuilding only when it changed. */
  sync(game: Game): void {
    const offered = game.state === 'upgrading';
    this.root.setVisible(offered);
    if (!offered) return;

    const key = `${game.currentChoices.map((c) => c.id).join(',')}|${game.rerolls}`;
    if (key === this.key) return;

    this.key = key;
    this.rebuild(game);
  }

  destroy(): void {
    this.root.removeAll(true);
    this.root.destroy();
  }

  private rebuild(game: Game): void {
    const scene = this.root.scene;
    const gw = this.layout.gameW;
    const gh = this.layout.gameH;
    const cx = gw / 2;

    this.root.removeAll(true);

    const overlay = scene.add.graphics();
    fillCss(overlay, OVERLAY_COLOR);
    overlay.fillRect(0, 0, gw, gh);
    this.root.add(overlay);

    const bannerSize = Math.round(gw * 0.075);
    this.root.add(
      addText(scene, cx, baselineToCenter(gh * 0.17, bannerSize), 'LEVEL UP!', {
        fontFamily: 'sans-serif',
        fontSize: `${bannerSize}px`,
        fontStyle: 'bold',
        color: THEME.NEON_YELLOW,
        align: 'center',
        padding: { left: 24, right: 24, top: 16, bottom: 16 },
        shadow: { offsetX: 0, offsetY: 0, color: THEME.NEON_YELLOW, blur: 14, fill: true },
      }).setOrigin(0.5),
    );

    const promptSize = Math.round(gw * 0.038);
    this.root.add(
      addText(scene, cx, baselineToCenter(gh * 0.22, promptSize), 'Choose one upgrade for your build:', {
        fontFamily: 'sans-serif',
        fontSize: `${promptSize}px`,
        fontStyle: '500',
        color: THEME.TEXT_SECONDARY,
        align: 'center',
      }).setOrigin(0.5),
    );

    const layout = upgradeCardLayout(gw, gh, game.currentChoices.length);
    for (let i = 0; i < game.currentChoices.length; i++) {
      this.drawCard(game.currentChoices[i], layout, i, gw);
    }

    this.drawReroll(game.rerolls, layout, gw);
  }

  private drawCard(card: Upgrade, layout: UpgradeCardLayout, index: number, gw: number): void {
    const scene = this.root.scene;
    const rect = layout.cards[index];
    const isRare = card.rarity === 'rare';

    const body = scene.add.graphics();
    fillCss(body, isRare ? THEME.CARD_BG_RARE : THEME.CARD_BG_COMMON);
    body.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 10);
    strokeCss(body, isRare ? THEME.CARD_BORDER_RARE : THEME.CARD_BORDER_COMMON, isRare ? 2.5 : 1.5);
    body.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 10);

    const badgeW = Math.round(rect.w * 0.22);
    const badgeH = Math.round(rect.h * 0.24);
    const badgeX = rect.x + rect.w - badgeW - 10;
    const badgeY = rect.y + 8;
    fillCss(body, isRare ? THEME.CARD_BADGE_RARE : THEME.CARD_BADGE_COMMON);
    body.fillRoundedRect(badgeX, badgeY, badgeW, badgeH, 4);
    this.root.add(body);

    const badgeSize = Math.round(gw * 0.026);
    this.root.add(
      addText(
        scene,
        badgeX + badgeW / 2,
        baselineToCenter(badgeY + badgeH * 0.72, badgeSize),
        isRare ? '★ RARE' : 'COMMON',
        {
          fontFamily: 'sans-serif',
          fontSize: `${badgeSize}px`,
          fontStyle: 'bold',
          color: isRare ? THEME.NEON_MAGENTA : THEME.NEON_CYAN,
          align: 'center',
        },
      ).setOrigin(0.5),
    );

    const titleSize = Math.round(gw * 0.044);
    this.root.add(
      addText(
        scene,
        rect.x + 14,
        baselineToCenter(rect.y + rect.h * 0.38, titleSize),
        card.name,
        {
          fontFamily: 'sans-serif',
          fontSize: `${titleSize}px`,
          fontStyle: 'bold',
          color: THEME.TEXT_PRIMARY,
        },
      ).setOrigin(0, 0.5),
    );

    const descSize = Math.round(gw * 0.031);
    this.root.add(
      addText(scene, rect.x + 14, baselineToCenter(rect.y + rect.h * 0.62, descSize), card.description, {
        fontFamily: 'sans-serif',
        fontSize: `${descSize}px`,
        color: THEME.TEXT_SECONDARY,
        wordWrap: { width: rect.w - 28, useAdvancedWrap: true },
      }).setOrigin(0, 0.5),
    );
  }

  private drawReroll(rerolls: number, layout: UpgradeCardLayout, gw: number): void {
    const scene = this.root.scene;
    const rect = layout.reroll;
    const canReroll = rerolls > 0;

    const button = scene.add.graphics();
    fillCss(button, canReroll ? THEME.BUTTON_BG : THEME.BUTTON_BG_DISABLED);
    button.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    strokeCss(button, canReroll ? THEME.BUTTON_BORDER : THEME.BUTTON_BORDER_DISABLED, 1.5);
    button.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    this.root.add(button);

    void UPGRADES; // (kept out of the view: the reroll count is gameplay state)

    const labelSize = Math.round(gw * 0.036);
    this.root.add(
      addText(
        scene,
        rect.x + rect.w / 2,
        baselineToCenter(rect.y + rect.h * 0.65, labelSize),
        `REROLL (${rerolls})`,
        {
          fontFamily: 'sans-serif',
          fontSize: `${labelSize}px`,
          fontStyle: 'bold',
          color: canReroll ? THEME.TEXT_PRIMARY : THEME.TEXT_MUTED,
          align: 'center',
        },
      ).setOrigin(0.5),
    );
  }
}
