import Phaser from 'phaser';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import { computeResultLayout, type ResultLayout } from '../layout/Layout.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { CREAM, CLAY, INK, INK_SOFT, PAPER_MID, SAGE, TERRACOTTA, toHex } from '../art/palette.ts';

interface GameOverData {
  ctx: SceneContextPort;
  score: number;
  bestStreak: number;
}

interface Button {
  readonly box: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

/**
 * Result Panel (AGENTS.md §2): the only screen that offers Retry and Exit.
 * Retry goes straight back into gameplay — the Play Screen never replays.
 */
export class GameOverScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private score = 0;
  private bestStreak = 0;
  private layout!: ResultLayout;
  private retrying = false;

  private bg!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreValue!: Phaser.GameObjects.Text;
  private streakLabel!: Phaser.GameObjects.Text;
  private streakValue!: Phaser.GameObjects.Text;
  private retry!: Button;
  private exit!: Button;

  constructor() {
    super('GameOver');
  }

  init(data: GameOverData): void {
    this.ctx = data.ctx;
    this.score = data.score;
    this.bestStreak = data.bestStreak;
    this.retrying = false;
  }

  create(): void {
    generateTextures(this);

    this.bg = this.add.image(0, 0, 'bg').setOrigin(0.5);

    this.title = this.add.text(0, 0, 'GAME OVER', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '54px',
      color: CLAY,
      stroke: INK,
      strokeThickness: 10,
    }).setOrigin(0.5);

    this.scoreLabel = this.add.text(0, 0, 'SCORE', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      color: INK_SOFT,
      stroke: CREAM,
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.scoreValue = this.add.text(0, 0, this.score.toLocaleString('en-US'), {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '64px',
      color: INK,
      stroke: CREAM,
      strokeThickness: 10,
    }).setOrigin(0.5);

    this.streakLabel = this.add.text(0, 0, 'BEST STREAK', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      color: INK_SOFT,
      stroke: CREAM,
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.streakValue = this.add.text(0, 0, `${this.bestStreak}`, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '44px',
      color: TERRACOTTA,
      stroke: INK,
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.retry = this.makeButton('▶  RETRY', toHex(SAGE), toHex(CREAM), () => this.retryRun());
    this.exit = this.makeButton('EXIT', toHex(PAPER_MID), toHex(INK), () => this.exitGame());

    this.tweens.add({
      targets: [this.retry.box, this.retry.label],
      scale: { from: 1, to: 1.04 },
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.applyLayout();

    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyLayout, this));
  }

  private makeButton(
    text: string,
    fill: number,
    color: number,
    onClick: () => void,
  ): Button {
    const box = this.add
      .rectangle(0, 0, 240, 62, fill)
      .setStrokeStyle(3, toHex(INK), 1)
      .setInteractive({ useHandCursor: true });

    // The house lettering rules: light labels take an ink outline, ink
    // labels take a cream halo so they stay legible on the paper button.
    const label = this.add.text(0, 0, text, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '26px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: color === toHex(INK) ? CREAM : INK,
      strokeThickness: 4,
    }).setOrigin(0.5);

    box.on('pointerdown', () => {
      this.tweens.killTweensOf([box, label]);
      box.setScale(0.95);
      label.setScale(0.95);
      this.time.delayedCall(90, () => {
        box.setScale(1);
        label.setScale(1);
        onClick();
      });
    });

    return { box, label };
  }

  /** Retry goes directly back to gameplay; the Play Screen never replays. */
  private retryRun(): void {
    if (this.retrying) return;
    this.retrying = true;
    this.scene.start('Game', { ctx: this.ctx });
  }

  /** Exit signals the host and does nothing else at all. */
  private exitGame(): void {
    this.ctx.host.exit({ lastWin: true, lastScore: this.score });
  }

  private applyLayout(): void {
    const { width, height } = this.scale;
    this.layout = computeResultLayout(width, height);
    const unit = this.layout.unit;

    this.bg.setPosition(width / 2, height / 2).setDisplaySize(width, height);

    this.title.setPosition(width / 2, this.layout.titleY).setFontSize(Math.max(34, 54 * unit));
    this.scoreLabel.setPosition(width / 2, this.layout.scoreLabelY).setFontSize(Math.max(13, 17 * unit));
    this.scoreValue.setPosition(width / 2, this.layout.scoreValueY).setFontSize(Math.max(40, 64 * unit));
    this.streakLabel.setPosition(width / 2, this.layout.streakLabelY).setFontSize(Math.max(13, 17 * unit));
    this.streakValue.setPosition(width / 2, this.layout.streakValueY).setFontSize(Math.max(28, 44 * unit));

    this.placeButton(this.retry, width / 2, this.layout.retryY, unit);
    this.placeButton(this.exit, width / 2, this.layout.exitY, unit);
  }

  private placeButton(button: Button, x: number, y: number, unit: number): void {
    button.box.setPosition(x, y).setSize(240 * unit, 62 * unit);
    button.label.setPosition(x, y).setFontSize(Math.max(18, 26 * unit));
  }
}
