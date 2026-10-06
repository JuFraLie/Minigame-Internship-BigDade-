import Phaser from 'phaser';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import { SIGNS } from '../../core/RpsRules.ts';
import { CARD_W, computePlayLayout, type PlayLayout } from '../layout/Layout.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { CREAM, INK, INK_SOFT, SAGE, TERRACOTTA, toHex } from '../art/palette.ts';

/**
 * Play Screen (AGENTS.md §2): title plus a Play button, and tapping anywhere
 * also starts the game. Gameplay never starts on its own.
 */
export class MainMenuScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private layout!: PlayLayout;
  private started = false;

  private bg!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private cards: Phaser.GameObjects.Image[] = [];
  private playBox!: Phaser.GameObjects.Rectangle;
  private playLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    generateTextures(this);
    this.ctx = this.registry.get('ctx') as SceneContextPort;
    this.started = false;

    this.bg = this.add.image(0, 0, 'bg').setOrigin(0.5);

    this.title = this.add.text(0, 0, 'RPS', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '78px',
      color: INK,
      stroke: CREAM,
      strokeThickness: 10,
    }).setOrigin(0.5);

    this.subtitle = this.add.text(0, 0, 'STREAK', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '52px',
      color: TERRACOTTA,
      stroke: INK,
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.hint = this.add.text(0, 0, 'Win in a row to raise the multiplier.\nOne loss resets it.', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      color: INK_SOFT,
      stroke: CREAM,
      strokeThickness: 4,
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // The three cards, as a teaser of the hand the player will hold.
    this.cards = SIGNS.map((sign) =>
      this.add.image(0, 0, `card_${sign}`).setOrigin(0.5),
    );

    this.playBox = this.add.rectangle(0, 0, 230, 66, toHex(SAGE), 1).setStrokeStyle(4, toHex(INK), 1);
    this.playLabel = this.add.text(0, 0, '▶  PLAY', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '28px',
      color: CREAM,
      stroke: INK,
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: [this.playBox, this.playLabel],
      scale: { from: 1, to: 1.05 },
      duration: 750,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // A gentle pulse on the title; scale-only, so a resize cannot drift it.
    this.tweens.add({
      targets: [this.title, this.subtitle],
      scale: { from: 1, to: 1.03 },
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.applyLayout();

    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyLayout, this));

    // Tapping anywhere on the Play Screen starts the game.
    this.input.once('pointerdown', () => this.startGame());
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;
    this.ctx.sfx.unlock();
    this.ctx.host.launch();
    this.scene.start('Game', { ctx: this.ctx });
  }

  /** Repositions everything for the current screen size (edge-to-edge). */
  private applyLayout(): void {
    const { width, height } = this.scale;
    this.layout = computePlayLayout(width, height);
    const unit = this.layout.unit;

    this.bg.setPosition(width / 2, height / 2).setDisplaySize(width, height);

    this.title.setPosition(width / 2, this.layout.titleY).setFontSize(78 * unit);
    this.subtitle.setPosition(width / 2, this.layout.subtitleY).setFontSize(52 * unit);
    this.hint
      .setPosition(width / 2, this.layout.hintY)
      .setFontSize(Math.max(13, 17 * unit))
      .setWordWrapWidth(width * 0.82);

    const cardGap = 16 * unit;
    const cardScale = (96 * unit) / CARD_W;
    const step = 96 * unit + cardGap;
    const startX = width / 2 - step;
    this.cards.forEach((card, i) => {
      card
        .setScale(cardScale)
        .setPosition(startX + i * step, this.layout.cardsY)
        .setRotation((i - 1) * 0.14);
    });

    this.playBox.setPosition(width / 2, this.layout.playY).setSize(230 * unit, 66 * unit);
    this.playLabel.setPosition(width / 2, this.layout.playY).setFontSize(28 * unit);
  }
}
