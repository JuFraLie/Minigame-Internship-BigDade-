import Phaser from 'phaser';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import { computeResultLayout, type ResultLayout } from '../layout/Layout.ts';
import { bakeLandArt, floorKey, queueLandArt } from '../art/LandArt.ts';
import { bakePlank } from '../art/PanelArt.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { AMBER, CYAN_HEX, INK, PAPER, SLATE, SLATE_HEX } from '../palette.ts';
import { FONT_BODY, FONT_HEAD, queueGameFont } from '../fonts.ts';

interface GameOverData {
  ctx: SceneContextPort;
  win: boolean;
  score: number;
  kills: number;
  level: number;
  wave: number;
}

interface Button {
  readonly box: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
}

/** The two buttons only this panel wears, each cut under its own key. */
const RETRY_PLANK = 'retry_button';
const EXIT_PLANK = 'exit_button';

/**
 * The Result Panel - the only screen that offers Retry and Exit.
 *
 * LAST BULLET is endless, so this panel is what death looks like: it reports
 * the run's final score, the wave reached, the kills and the level. Retry goes
 * straight back into gameplay - the Play Screen never replays (AGENTS.md
 * section 2). Exit calls the bridge once and does nothing else - no
 * navigation, no restart - because tearing the session down belongs to the
 * host app.
 */
export class GameOverScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private win = false;
  private score = 0;
  private kills = 0;
  private level = 1;
  private wave = 1;

  private layout!: ResultLayout;
  private leaving = false;

  private floor?: Phaser.GameObjects.TileSprite;
  private title?: Phaser.GameObjects.Text;
  private scoreLabel?: Phaser.GameObjects.Text;
  private scoreValue?: Phaser.GameObjects.Text;
  private stats?: Phaser.GameObjects.Text;
  private waveLine?: Phaser.GameObjects.Text;
  private retry?: Button;
  private exit?: Button;

  constructor() {
    super('GameOver');
  }

  init(data: GameOverData): void {
    this.ctx = data.ctx;
    this.win = data.win;
    this.score = data.score;
    this.kills = data.kills;
    this.level = data.level;
    this.wave = data.wave;
    this.leaving = false;
  }

  /**
   * The ground is asked for here as well, so the panel never depends on some
   * other scene having fetched it; a repeat request costs nothing, since the
   * pack is already in the texture cache by the time a round can end.
   */
  preload(): void {
    queueGameFont(this);
    queueLandArt(this);
  }

  create(): void {
    generateTextures(this);
    bakeLandArt(this);

    const { width, height } = this.scale;
    // The layout has to exist before the buttons do: their planks are cut to
    // the buttons' laid-out size, and only the layout knows that size.
    this.layout = computeResultLayout(width, height);
    this.floor = this.add
      .tileSprite(width / 2, height / 2, width, height, floorKey(this))
      .setScrollFactor(0)
      .setDepth(-10);

    this.title = this.add
      .text(0, 0, 'YOU FELL', {
        fontFamily: FONT_HEAD,
        fontSize: '56px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5, 0.5);

    this.scoreLabel = this.add
      .text(0, 0, 'FINAL SCORE', {
        fontFamily: FONT_BODY,
        fontSize: '17px',
        color: SLATE,
        stroke: '#0b0f1a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);

    this.scoreValue = this.add
      .text(0, 0, this.score.toLocaleString('en-US'), {
        fontFamily: FONT_HEAD,
        fontSize: '68px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5, 0.5);

    this.stats = this.add
      .text(0, 0, this.statsText(), {
        fontFamily: FONT_BODY,
        fontSize: '17px',
        color: SLATE,
        stroke: '#0b0f1a',
        strokeThickness: 4,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0.5);

    this.waveLine = this.add
      .text(0, 0, `WAVE ${this.wave}`, {
        fontFamily: FONT_HEAD,
        fontSize: '16px',
        color: AMBER,
        stroke: '#0b0f1a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);

    this.retry = this.makeButton(RETRY_PLANK, 'RETRY', CYAN_HEX, () => this.retryRound());
    this.exit = this.makeButton(EXIT_PLANK, 'EXIT', SLATE_HEX, () => this.exitGame());

    this.tweens.add({
      targets: [this.retry.box, this.retry.label],
      scale: { from: 1, to: 1.04 },
      duration: 850,
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
  }

  /** Retry goes directly back to gameplay; the Play Screen never replays. */
  private retryRound(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.ctx.sound.ui();
    this.scene.start('Game', { ctx: this.ctx });
  }

  /** Signals the host once and does nothing else at all. */
  private exitGame(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.ctx.host.exit({ lastWin: this.win, lastScore: this.score });
  }

  private makeButton(key: string, text: string, accent: number, onClick: () => void): Button {
    // Cut before it is drawn: `add.image` resolves the texture on the spot.
    this.cutButton(key, accent);

    const box = this.add.image(0, 0, key).setInteractive({ useHandCursor: true });

    const label = this.add
      .text(0, 0, text, {
        fontFamily: FONT_HEAD,
        fontSize: '26px',
        // Ink on pale timber: the accent this label used to shout in is now
        // the stripe down the plank's edge.
        color: INK,
      })
      .setOrigin(0.5, 0.5);

    box.on('pointerdown', () => {
      this.tweens.killTweensOf([box, label]);
      box.setScale(0.96);
      this.time.delayedCall(80, () => {
        box.setScale(1);
        onClick();
      });
    });

    return { box, label };
  }

  /**
   * Cuts a button's plank to the size `applyLayout` gives that button. When the
   * button already exists, it is re-pointed at the fresh texture (an image
   * keeps the frame it was built with) and its hit area - a rectangle measured
   * once, at `setInteractive()` - is resized to match, so a recut never leaves
   * the button drawn bigger than it is tappable.
   */
  private cutButton(key: string, accent: number, box?: Phaser.GameObjects.Image): void {
    const { unit } = this.layout;
    const w = Math.min(this.scale.width - 90 * unit, 250 * unit);
    const h = 62 * unit;
    bakePlank(this, key, w, h, {
      color: accent,
      width: Math.round(6 * unit),
    });
    if (!box) return;
    box.setTexture(key);
    if (box.input) box.input.hitArea.setSize(w, h);
  }

  private statsText(): string {
    return `KILLS ${this.kills}   LEVEL ${this.level}`;
  }

  private applyLayout = (): void => {
    const { width, height } = this.scale;
    this.layout = computeResultLayout(width, height);
    const { unit, titleY, scoreLabelY, scoreValueY, statsY, retryY, exitY } = this.layout;

    // `setSize`, not `setDisplaySize`: the pattern must keep its world scale,
    // or a resize would stretch the ground tiles off-square.
    this.floor?.setPosition(width / 2, height / 2).setSize(width, height);

    this.title?.setPosition(width / 2, titleY).setFontSize(Math.max(34, 56 * unit));
    this.scoreLabel
      ?.setPosition(width / 2, scoreLabelY)
      .setFontSize(Math.max(13, 17 * unit));
    this.scoreValue
      ?.setPosition(width / 2, scoreValueY)
      .setFontSize(Math.max(42, 68 * unit));
    this.waveLine
      ?.setPosition(width / 2, statsY)
      .setFontSize(Math.max(13, 16 * unit));
    this.stats
      ?.setPosition(width / 2, statsY + 40 * unit)
      .setFontSize(Math.max(14, 17 * unit))
      .setWordWrapWidth(width * 0.86);

    if (this.retry && this.exit) {
      // Recut first: a resize changes the buttons' size, so it changes the
      // planks too - and an image keeps the frame it was built with, so it
      // has to be pointed at the fresh texture before it is placed.
      this.cutButton(RETRY_PLANK, CYAN_HEX, this.retry.box);
      this.cutButton(EXIT_PLANK, SLATE_HEX, this.exit.box);
      this.placeButton(this.retry, width / 2, retryY, unit);
      this.placeButton(this.exit, width / 2, exitY, unit);
    }
  };

  private placeButton(button: Button, x: number, y: number, unit: number): void {
    button.box.setPosition(x, y);
    button.label.setPosition(x, y).setFontSize(Math.max(19, 26 * unit));
  }
}
