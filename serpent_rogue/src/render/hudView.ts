// hudView.ts — the in-run HUD: stage, score, best score, level, XP bar, combo
// and defensive badges.
//
// Layout geometry comes from core/uiLayout.ts (shared with the controller's
// hit-testing); this file only draws. Texts are created once and updated only
// when their string actually changes, so an unchanged HUD costs nothing per
// frame beyond its two bar rectangles.

import type Phaser from 'phaser';
import { HUD, THEME } from '../config/gameConfig.ts';
import type { Layout } from '../core/types.ts';
import { hudLayout, topPadFor, type HudLayout } from '../core/uiLayout.ts';
import type { Game } from '../game/game.ts';
import { fillCss } from './color.ts';
import { addText, baselineToCenter, setText } from './text.ts';

const DEPTH = 10;
const MONO = 'monospace';
const SANS = 'sans-serif';

export class HudView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly stageLabel: Phaser.GameObjects.Text;
  private readonly stageName: Phaser.GameObjects.Text;
  private readonly score: Phaser.GameObjects.Text;
  private readonly hiScore: Phaser.GameObjects.Text;
  private readonly level: Phaser.GameObjects.Text;
  private readonly combo: Phaser.GameObjects.Text;
  private readonly shields: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private readonly layout: Layout) {
    this.graphics = scene.add.graphics().setDepth(DEPTH);

    const gw = layout.gameW;
    const hud = hudLayout(gw, topPadFor(layout.gameH));
    const barY = hud.baselineY + 8;
    const barH = HUD.XP_BAR_HEIGHT;
    const badgeBaseline = barY + barH + 6 + 8;

    this.stageLabel = addText(
      scene,
      hud.pad,
      baselineToCenter(hud.baselineY, hud.fontSize * 0.72),
      'STAGE 1',
      {
        fontFamily: SANS,
        fontSize: `${Math.round(hud.fontSize * 0.72)}px`,
        fontStyle: 'bold',
        color: THEME.NEON_CYAN,
      },
    ).setOrigin(0, 0.5);

    this.stageName = addText(
      scene,
      hud.pad + Math.round(gw * 0.22),
      baselineToCenter(hud.baselineY, hud.fontSize * 0.52),
      '',
      {
        fontFamily: SANS,
        fontSize: `${Math.round(hud.fontSize * 0.52)}px`,
        fontStyle: '500',
        color: THEME.TEXT_MUTED,
      },
    ).setOrigin(0, 0.5);

    this.score = addText(
      scene,
      hud.textRight,
      baselineToCenter(hud.baselineY, hud.fontSize),
      '00000',
      {
        fontFamily: MONO,
        fontSize: `${hud.fontSize}px`,
        fontStyle: 'bold',
        color: THEME.TEXT_PRIMARY,
      },
    ).setOrigin(1, 0.5);

    this.hiScore = addText(
      scene,
      hud.textRight,
      baselineToCenter(hud.baselineY, hud.hiFontSize),
      'HI 00000',
      {
        fontFamily: MONO,
        fontSize: `${hud.hiFontSize}px`,
        fontStyle: 'bold',
        color: THEME.TEXT_MUTED,
      },
    )
      .setOrigin(1, 0.5)
      .setVisible(false);

    this.level = addText(
      scene,
      hud.pad,
      baselineToCenter(barY + barH + 14, hud.fontSize * 0.65),
      'LV 1',
      {
        fontFamily: SANS,
        fontSize: `${Math.round(hud.fontSize * 0.65)}px`,
        fontStyle: 'bold',
        color: THEME.NEON_YELLOW,
      },
    ).setOrigin(0, 0.5);

    this.combo = addText(
      scene,
      hud.pad + Math.round(gw * 0.2),
      baselineToCenter(badgeBaseline, hud.fontSize * 0.65),
      '',
      {
        fontFamily: SANS,
        fontSize: `${Math.round(hud.fontSize * 0.65)}px`,
        fontStyle: 'bold',
        color: THEME.NEON_ORANGE,
      },
    )
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.shields = addText(
      scene,
      hud.textRight,
      baselineToCenter(badgeBaseline, hud.fontSize * 0.6),
      '',
      {
        fontFamily: SANS,
        fontSize: `${Math.round(hud.fontSize * 0.6)}px`,
        fontStyle: 'bold',
        color: THEME.NEON_GREEN,
      },
    )
      .setOrigin(1, 0.5)
      .setVisible(false);

    // Keep every label above the bar Graphics (DEPTH) and above the playfield
    // below it, whatever order the display list ends up in.
    for (const text of [
      this.stageLabel,
      this.stageName,
      this.score,
      this.hiScore,
      this.level,
      this.combo,
      this.shields,
    ]) {
      text.setDepth(DEPTH + 1);
    }
  }

  /** Refreshes every value that can change during a run. */
  render(game: Game): void {
    const gw = this.layout.gameW;
    const hud = hudLayout(gw, topPadFor(this.layout.gameH));
    const stage = game.stageManager.getStageInfo();

    setText(this.stageLabel, `STAGE ${stage.stageNumber}`);
    setText(this.stageName, stage.name);

    const scoreText = Math.floor(game.score).toString().padStart(5, '0');
    setText(this.score, scoreText);

    const showHi = game.hiScore > 0;
    this.hiScore.setVisible(showHi);
    if (showHi) {
      setText(this.hiScore, `HI ${Math.floor(game.hiScore).toString().padStart(5, '0')}`);
      // The best score sits to the left of the live one, so it has to know how
      // wide that number actually rendered — in design units, like everything else.
      this.hiScore.x = hud.textRight - this.score.width - hud.hiGap;
    }

    setText(this.level, `LV ${game.level}`);
    this.drawXpBar(game, hud);

    const multiplier = game.comboTracker.multiplier;
    const showCombo = multiplier > 1;
    this.combo.setVisible(showCombo);
    if (showCombo) setText(this.combo, `⚡ ${multiplier}x COMBO`);

    const showShields = game.shedSkinCount > 0 || game.rockSmasherCount > 0;
    this.shields.setVisible(showShields);
    if (showShields) {
      let badges = '';
      if (game.shedSkinCount > 0) badges += `🛡️×${game.shedSkinCount} `;
      if (game.rockSmasherCount > 0) badges += `🔨×${game.rockSmasherCount}`;
      setText(this.shields, badges);
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.stageLabel.destroy();
    this.stageName.destroy();
    this.score.destroy();
    this.hiScore.destroy();
    this.level.destroy();
    this.combo.destroy();
    this.shields.destroy();
  }

  private drawXpBar(game: Game, hud: HudLayout): void {
    const barY = hud.baselineY + 8;
    const barW = this.layout.gameW - hud.pad * 2;
    const ratio = Math.min(1, Math.max(0, game.xp / game.xpNeeded));

    const graphics = this.graphics;
    graphics.clear();

    fillCss(graphics, THEME.XP_BAR_BG);
    graphics.fillRoundedRect(hud.pad, barY, barW, HUD.XP_BAR_HEIGHT, 3);

    if (ratio > 0) {
      fillCss(graphics, THEME.XP_BAR_FILL);
      graphics.fillRoundedRect(hud.pad, barY, barW * ratio, HUD.XP_BAR_HEIGHT, 3);
    }
  }
}
