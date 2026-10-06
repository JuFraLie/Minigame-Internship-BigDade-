import Phaser from 'phaser';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import { computePlayLayout, type PlayLayout } from '../layout/Layout.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { AMBER, CARD_HEX, CYAN, CYAN_HEX, PAPER, SLATE } from '../palette.ts';

const FONT_HEAD = '"Arial Black", Impact, sans-serif';
const FONT_BODY = 'Arial, Helvetica, sans-serif';

/**
 * The Play Screen (AGENTS.md section 2): title plus a Play button, and tapping
 * anywhere on it also starts the round. Gameplay never starts on its own.
 *
 * The how-to is exactly two sentences, because the controls are not
 * self-evident: dragging is obvious, auto-fire and the walk-to-reload loop are
 * not.
 */
export class MainMenuScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private layout!: PlayLayout;
  private started = false;

  private grid?: Phaser.GameObjects.TileSprite;
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private playBox?: Phaser.GameObjects.Rectangle;
  private playLabel?: Phaser.GameObjects.Text;

  private glow?: Phaser.GameObjects.Image;
  private heroBullet?: Phaser.GameObjects.Image;
  private readonly heroEnemies: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('MainMenu');
  }

  create(): void {
    generateTextures(this);
    this.ctx = this.registry.get('ctx') as SceneContextPort;
    this.started = false;
    this.heroEnemies.length = 0;

    const { width, height } = this.scale;
    this.grid = this.add
      .tileSprite(width / 2, height / 2, width, height, 'grid')
      .setScrollFactor(0)
      .setDepth(-10);

    this.title = this.add
      .text(0, 0, 'LAST', {
        fontFamily: FONT_HEAD,
        fontSize: '76px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5, 0.5);

    this.subtitle = this.add
      .text(0, 0, 'BULLET', {
        fontFamily: FONT_HEAD,
        fontSize: '76px',
        color: AMBER,
        stroke: '#0b0f1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5, 0.5);

    this.hint = this.add
      .text(0, 0, 'Drag or W A S D to move. Your bullet fires itself, so pick it up again!', {
        fontFamily: FONT_BODY,
        fontSize: '17px',
        color: SLATE,
        align: 'center',
        lineSpacing: 7,
      })
      .setOrigin(0.5, 0.5);

    this.buildHero();

    this.playBox = this.add
      .rectangle(0, 0, 240, 66, CARD_HEX, 1)
      .setStrokeStyle(4, CYAN_HEX, 1)
      .setInteractive({ useHandCursor: true });
    this.playLabel = this.add
      .text(0, 0, 'PLAY', {
        fontFamily: FONT_HEAD,
        fontSize: '30px',
        color: CYAN,
        stroke: '#0b0f1a',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0.5);

    this.tweens.add({
      targets: [this.playBox, this.playLabel],
      scale: { from: 1, to: 1.05 },
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: [this.title, this.subtitle],
      scale: { from: 1, to: 1.025 },
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.applyLayout();

    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyLayout, this);
      this.tweens.killAll();
    });

    // Tapping anywhere on the Play Screen starts the round. The Play button is
    // the same action, so the `started` guard keeps it to exactly one launch.
    this.input.on('pointerdown', () => this.start());
    this.playBox.on('pointerdown', () => this.start());
  }

  private buildHero(): void {
    this.glow = this.add.image(0, 0, 'glow').setScale(1.5);
    this.heroBullet = this.add.image(0, 0, 'bullet').setScale(2.4).setRotation(-0.35);

    this.tweens.add({
      targets: this.glow,
      alpha: { from: 0.5, to: 1 },
      scale: { from: 1.3, to: 1.75 },
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    for (let i = 0; i < 5; i++) {
      const enemy = this.add
        .image(0, 0, i % 3 === 0 ? 'enemy_fast' : 'enemy_zombie')
        .setAlpha(0.7)
        .setRotation((i / 5) * Math.PI * 2);
      this.heroEnemies.push(enemy);
      this.tweens.add({
        targets: enemy,
        alpha: { from: 0.35, to: 0.9 },
        duration: 700 + i * 90,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private start(): void {
    if (this.started) return;
    this.started = true;

    // The bridge was verified before any game code ran; this is the one moment
    // the host is told the player actually pressed Play (AGENTS.md A4.2).
    this.ctx.host.launch();
    this.scene.start('Game', { ctx: this.ctx });
  }

  /** Repositions everything for the current screen size (edge-to-edge). */
  private applyLayout(): void {
    const { width, height } = this.scale;
    this.layout = computePlayLayout(width, height);
    const { unit, titleY, hintY, heroY, playY } = this.layout;

    this.grid?.setPosition(width / 2, height / 2).setDisplaySize(width, height);

    this.title
      ?.setPosition(width / 2, titleY)
      .setFontSize(Math.max(44, 76 * unit));
    this.subtitle
      ?.setPosition(width / 2, titleY + 62 * unit)
      .setFontSize(Math.max(44, 76 * unit));
    this.hint
      ?.setPosition(width / 2, hintY)
      .setFontSize(Math.max(14, 17 * unit))
      .setWordWrapWidth(width * 0.82);

    this.glow?.setPosition(width / 2, heroY);
    this.heroBullet?.setPosition(width / 2, heroY);

    const radius = Math.min(width * 0.34, 150 * unit) + 40 * unit;
    this.heroEnemies.forEach((enemy, i) => {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      enemy.setPosition(
        width / 2 + Math.cos(angle) * radius,
        heroY + Math.sin(angle) * radius * 0.6,
      );
    });

    this.playBox
      ?.setPosition(width / 2, playY)
      .setSize(Math.min(width - 80 * unit, 250 * unit), 66 * unit);
    this.playLabel
      ?.setPosition(width / 2, playY)
      .setFontSize(Math.max(22, 30 * unit));
  }
}
