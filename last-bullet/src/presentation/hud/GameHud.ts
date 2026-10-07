import Phaser from 'phaser';
import type { WorldFrame } from '../../core/types.ts';
import { MAX_CHAMBER, PLAYER_MAX_HP } from '../../core/config.ts';
import type { HudLayout } from '../layout/Layout.ts';
import { AMBER, INK_HEX, LIME_HEX, PAPER, SLATE, SLATE_HEX } from '../palette.ts';
import { FONT_BODY, FONT_HEAD } from '../fonts.ts';

const DEPTH_HUD = 20;

/**
 * Banner timing: the "WAVE n" card leads a spawn by `BANNER_LEAD` seconds and
 * fades across `BANNER_FADE`, so the next one has always taken over before the
 * zombies actually arrive.
 */
const BANNER_LEAD = 1.4;
const BANNER_FADE = 0.4;
const BANNER_FADE_IN = 0.3;

/**
 * The in-round HUD: live score, wave, hearts, XP bar and the chamber readout,
 * plus the mid-screen wave banner. Every object of it is pinned to the screen
 * - the camera follows the player, so a world-space HUD would slide off the
 * display as soon as the round started moving.
 *
 * Text objects are only written when their string actually changes - Phaser
 * re-rasterises a text texture on `setText`, and at 50 FPS that would be the
 * most expensive thing on screen. Score and the wave readout are the two that
 * move, and they move at most once a second and once per kill.
 *
 * The chamber pips are the "am I armed?" indicator: one pip per slot in the
 * chamber, filled while a bullet is actually carried.
 */
export class GameHud {
  private readonly scene: Phaser.Scene;
  private readonly onPause: () => void;

  private layout: HudLayout;
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private pips: Phaser.GameObjects.Image[] = [];
  private waveLabel!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private level!: Phaser.GameObjects.Text;
  private xpBack!: Phaser.GameObjects.Rectangle;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private pauseBox!: Phaser.GameObjects.Rectangle;
  private pauseLabel!: Phaser.GameObjects.Text;

  private lastWave = '';
  private lastBanner = '';
  private lastPhase: WorldFrame['phase'] | null = null;
  private lastScore = '';
  private lastLevel = '';
  private lastHp = -1;
  private lastChamber = -1;
  private lastHeld = -1;
  private xpRatio = -1;

  constructor(scene: Phaser.Scene, layout: HudLayout, onPause: () => void) {
    this.scene = scene;
    this.onPause = onPause;
    this.layout = layout;
    this.build();
    this.applyLayout(layout);
  }

  /** Repositions everything; called on create and on every resize. */
  applyLayout(layout: HudLayout): void {
    this.layout = layout;
    const unit = layout.unit;

    this.hearts.forEach((heart, i) => {
      heart
        .setPosition(
          layout.heartsX + i * (layout.heartSize + layout.heartGap) + layout.heartSize / 2,
          layout.heartsY,
        )
        .setDisplaySize(layout.heartSize, layout.heartSize * (26 / 28));
    });

    this.waveLabel
      .setPosition(layout.width / 2, layout.waveY)
      .setFontSize(Math.max(17, 21 * unit));
    this.banner
      .setPosition(layout.width / 2, layout.bannerY)
      .setFontSize(Math.max(26, 40 * unit));
    this.score
      .setPosition(layout.scoreX, layout.scoreY)
      .setFontSize(Math.max(18, 25 * unit))
      .setOrigin(0, 0.5);

    this.layoutPips();

    const barX = layout.xpInset;
    const barW = layout.width - layout.xpInset * 2;
    const barY = layout.xpY - layout.xpHeight / 2;
    this.xpBack.setPosition(barX, barY).setSize(barW, layout.xpHeight);
    this.xpFill.setPosition(barX, barY).setSize(barW, layout.xpHeight);
    this.xpFill.scaleX = this.xpRatio < 0 ? 0 : this.xpRatio;
    this.level
      .setPosition(barX, layout.xpY + layout.xpHeight / 2 + 13 * unit)
      .setFontSize(Math.max(11, 14 * unit))
      .setOrigin(0, 0.5);

    this.pauseBox
      .setPosition(layout.pauseX, layout.pauseY)
      .setSize(layout.pauseSize, layout.pauseSize);
    this.pauseLabel
      .setPosition(layout.pauseX, layout.pauseY)
      .setFontSize(Math.max(13, 16 * unit));

    // Anchors and font sizes changed, so the cached strings are stale.
    this.lastWave = '';
    this.lastBanner = '';
    this.lastPhase = null;
    this.lastScore = '';
    this.lastLevel = '';
  }

  sync(frame: WorldFrame): void {
    const wave = waveLabelFor(frame);
    if (wave !== this.lastWave) {
      this.lastWave = wave;
      this.waveLabel.setText(wave);
    }

    // Only on a phase change: `setColor` re-rasterises the texture too.
    if (frame.phase !== this.lastPhase) {
      this.lastPhase = frame.phase;
      this.waveLabel.setColor(frame.phase === 'breather' ? AMBER : PAPER);
    }

    this.syncBanner(frame);

    const score = frame.score.toLocaleString('en-US');
    if (score !== this.lastScore) {
      this.lastScore = score;
      this.score.setText(score);
    }

    const level = `LV ${frame.level}   XP ${frame.xp}/${frame.xpNeeded}`;
    if (level !== this.lastLevel) {
      this.lastLevel = level;
      this.level.setText(level);
    }

    if (frame.player.hp !== this.lastHp) {
      this.lastHp = frame.player.hp;
      this.applyHearts(frame.player.hp);
    }

    if (frame.chamber !== this.lastChamber) {
      this.lastChamber = frame.chamber;
      this.rebuildPips();
    }

    if (frame.held !== this.lastHeld) {
      this.lastHeld = frame.held;
      this.applyPips(frame.held);
    }

    const ratio = frame.xpNeeded > 0 ? Math.min(1, frame.xp / frame.xpNeeded) : 0;
    if (ratio !== this.xpRatio) {
      this.xpRatio = ratio;
      this.xpFill.scaleX = ratio;
    }
  }

  /**
   * The mid-screen banner: "WAVE n" as a wave starts, "WAVE CLEARED" while it
   * is being cleaned up, then "WAVE n+1" over the last breath of the breather.
   * Everything is derived from the frame, so the HUD never tracks wave state.
   */
  private syncBanner(frame: WorldFrame): void {
    let text = '';
    let alpha = 0;

    if (frame.phase === 'fight') {
      // Straight after a spawn - including the round's first wave.
      if (frame.phaseAge < BANNER_LEAD) {
        text = `WAVE ${frame.wave}`;
        alpha = Math.min(1, (BANNER_LEAD - frame.phaseAge) / BANNER_FADE);
      }
    } else if (frame.breatherLeft > BANNER_LEAD) {
      text = 'WAVE CLEARED';
      alpha = Math.min(1, frame.phaseAge / BANNER_FADE_IN);
      alpha *= Math.min(1, (frame.breatherLeft - BANNER_LEAD) / BANNER_FADE);
    } else {
      text = `WAVE ${frame.wave + 1}`;
      alpha = Math.min(1, (BANNER_LEAD - frame.breatherLeft) / BANNER_FADE);
    }

    if (text !== this.lastBanner) {
      this.lastBanner = text;
      this.banner.setText(text);
    }
    this.banner.setVisible(alpha > 0).setAlpha(alpha);
  }

  // -------------------------------------------------------------------------

  private build(): void {
    // Every HUD object is screen-space: the camera follows the player, so
    // anything left in world coordinates would slide off the display the
    // moment the round started moving.
    this.waveLabel = this.scene.add
      .text(0, 0, 'WAVE 1', {
        fontFamily: FONT_HEAD,
        fontSize: '21px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);

    this.banner = this.scene.add
      .text(0, 0, '', {
        fontFamily: FONT_HEAD,
        fontSize: '40px',
        color: AMBER,
        stroke: '#0b0f1a',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    this.score = this.scene.add
      .text(0, 0, '0', {
        fontFamily: FONT_HEAD,
        fontSize: '25px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 5,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);

    this.level = this.scene.add
      .text(0, 0, 'LV 1', {
        fontFamily: FONT_BODY,
        fontSize: '14px',
        color: SLATE,
        stroke: '#0b0f1a',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);

    this.xpBack = this.scene.add
      .rectangle(0, 0, 10, 10, INK_HEX, 0.72)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD);
    this.xpFill = this.scene.add
      .rectangle(0, 0, 10, 10, LIME_HEX)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD + 1);

    // Only the box is interactive: the label sits on top of it but is inert,
    // so one tap reaches exactly one handler.
    this.pauseBox = this.scene.add
      .rectangle(0, 0, 40, 40, INK_HEX, 0.6)
      .setStrokeStyle(2, SLATE_HEX, 0.9)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setInteractive({ useHandCursor: true });
    this.pauseBox.on('pointerdown', () => this.onPause());

    this.pauseLabel = this.scene.add
      .text(0, 0, 'II', {
        fontFamily: FONT_HEAD,
        fontSize: '16px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD + 1);

    for (let i = 0; i < PLAYER_MAX_HP; i++) {
      this.hearts.push(
        this.scene.add
          .image(0, 0, 'heart_off')
          .setScrollFactor(0)
          .setDepth(DEPTH_HUD)
          .setVisible(true),
      );
    }

    this.rebuildPips();
  }

  private rebuildPips(): void {
    for (const pip of this.pips) pip.destroy();
    this.pips = [];

    const count = Math.max(1, Math.min(MAX_CHAMBER, this.lastChamber));
    for (let i = 0; i < count; i++) {
      this.pips.push(
        this.scene.add.image(0, 0, 'pip_off').setScrollFactor(0).setDepth(DEPTH_HUD + 1),
      );
    }
    this.layoutPips();
    this.applyPips(this.lastHeld < 0 ? 0 : this.lastHeld);
  }

  private layoutPips(): void {
    const layout = this.layout;
    const stride = layout.pipSize + layout.pipGap;
    const total = this.pips.length * stride - layout.pipGap;

    this.pips.forEach((pip, i) => {
      pip
        .setPosition(
          layout.chamberRight - total + i * stride + layout.pipSize / 2,
          layout.chamberY,
        )
        .setDisplaySize(layout.pipSize, layout.pipSize);
    });
  }

  private applyPips(held: number): void {
    for (let i = 0; i < this.pips.length; i++) {
      this.pips[i].setTexture(i < held ? 'pip_on' : 'pip_off');
    }
  }

  private applyHearts(hp: number): void {
    for (let i = 0; i < this.hearts.length; i++) {
      this.hearts[i].setTexture(i < hp ? 'heart_on' : 'heart_off');
    }
  }
}

/** `WAVE 7` in a fight, `NEXT 8 · 3` while the next wave is brewing. */
const waveLabelFor = (frame: WorldFrame): string =>
  frame.phase === 'breather'
    ? `NEXT ${frame.wave + 1} · ${Math.ceil(frame.breatherLeft)}`
    : `WAVE ${frame.wave}`;
