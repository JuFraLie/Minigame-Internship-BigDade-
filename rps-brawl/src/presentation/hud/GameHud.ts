import Phaser from 'phaser';
import type { ClashResult, EnemyDefeatedEvent } from '../../core/types.ts';
import type { GameLayout } from '../layout/Layout.ts';
import { CREAM, INK, INK_SOFT, RESULT_COLOR, TERRACOTTA } from '../art/palette.ts';
import { HEART_W } from '../art/TextureGenerator.ts';

/**
 * The persistent HUD: hearts, score, multiplier, streak and the result
 * banner — their creation, their placement, and every update that touches
 * them.
 *
 * Keeping them together is what stops the scene from turning into a list of
 * `setText` calls: the world's state reaches this class as plain method
 * calls, and nothing else on screen is disturbed.
 */
export class GameHud {
  private layout!: GameLayout;

  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly multText: Phaser.GameObjects.Text;
  private readonly streakText: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly hearts: Phaser.GameObjects.Image[];

  constructor(private readonly scene: Phaser.Scene, maxHearts: number) {
    this.scoreText = scene.add.text(0, 0, '0', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '46px',
      color: INK,
      stroke: CREAM,
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.multText = scene.add.text(0, 0, '×1', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '34px',
      color: TERRACOTTA,
      stroke: INK,
      strokeThickness: 6,
    }).setOrigin(1, 0.5);

    this.streakText = scene.add.text(0, 0, 'STREAK 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: INK_SOFT,
      stroke: CREAM,
      strokeThickness: 4,
    }).setOrigin(1, 0.5);

    this.hearts = Array.from({ length: maxHearts }, () =>
      scene.add.image(0, 0, 'heart_full').setOrigin(0, 0.5),
    );

    this.banner = scene.add.text(0, 0, 'WIN', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '56px',
      color: RESULT_COLOR.WIN,
      stroke: INK,
      strokeThickness: 10,
    }).setOrigin(0.5).setVisible(false);
  }

  /** Positions (and repositions, on resize) every element of the HUD. */
  applyLayout(layout: GameLayout): void {
    this.layout = layout;
    const { unit, hud, banner } = layout;

    this.scoreText
      .setPosition(hud.score.x, hud.score.y)
      .setFontSize(Math.max(28, 46 * unit));
    this.multText
      .setPosition(hud.multiplier.x, hud.multiplier.y - 8 * unit)
      .setFontSize(Math.max(20, 34 * unit));
    this.streakText
      .setPosition(hud.multiplier.x, hud.multiplier.y + 22 * unit)
      .setFontSize(Math.max(11, 14 * unit));

    this.hearts.forEach((heart, i) => {
      heart
        .setPosition(hud.heartsOrigin.x + i * hud.heartGap, hud.heartsOrigin.y)
        .setScale(hud.heartSize / HEART_W);
    });

    this.banner
      .setPosition(banner.x, banner.y)
      .setFontSize(Math.max(34, 56 * unit));
  }

  /** A win landed: score, multiplier and streak move together. */
  applyWin(defeat: EnemyDefeatedEvent | null): void {
    if (!defeat) return;
    this.scoreText.setText(defeat.score.toLocaleString('en-US'));
    this.multText.setText(`×${defeat.multiplier}`);
    this.streakText.setText(`STREAK ${defeat.streak}`);
    this.pulse(this.scoreText, 1.22);
    this.pulse(this.multText, 1.3);
  }

  /** A loss landed: hearts drop and the streak is thrown away. */
  applyLoss(heartsLeft: number): void {
    this.setHearts(heartsLeft);
    this.streakText.setText('STREAK 0');
    this.multText.setText('×1');
  }

  /** Pops the WIN / LOSE / TIE banner in. */
  showResult(result: ClashResult): void {
    this.banner
      .setText(result)
      .setColor(RESULT_COLOR[result])
      .setVisible(true)
      .setAlpha(1)
      .setScale(0.4);
    this.scene.tweens.killTweensOf(this.banner);
    this.scene.tweens.add({ targets: this.banner, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  hideResult(): void {
    this.scene.tweens.killTweensOf(this.banner);
    this.scene.tweens.add({
      targets: this.banner,
      alpha: 0,
      duration: 160,
      onComplete: () => this.banner.setVisible(false).setAlpha(1),
    });
  }

  /** The heart at `heartsLeft` just emptied — pop it before it goes grey. */
  breakHeart(heartsLeft: number): void {
    const heart = this.hearts[heartsLeft];
    if (!heart) return;
    const base = this.layout.hud.heartSize / HEART_W;
    this.scene.tweens.killTweensOf(heart);
    heart.setScale(base);
    this.scene.tweens.add({
      targets: heart,
      scale: base * 1.5,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private setHearts(count: number): void {
    this.hearts.forEach((heart, i) => {
      heart.setTexture(i < count ? 'heart_full' : 'heart_broken');
    });
  }

  private pulse(target: Phaser.GameObjects.Text, amount: number): void {
    this.scene.tweens.killTweensOf(target);
    target.setScale(1);
    this.scene.tweens.add({
      targets: target,
      scale: amount,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }
}
