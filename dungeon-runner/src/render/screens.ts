// screens.ts — full-screen overlays (Play Screen + Result Panel) as Phaser
// views. Positions come from the Layout port (any screen height, §3.1) and
// button rects from core/uiLayout.ts — the SAME rects the game controller
// hit-tests, so the clickable area can never drift from the drawn button.

import { playButton, resultButtons } from '../core/uiLayout.ts';
import type { Layout, Rect } from '../core/types.ts';

const BTN_RESTART = 0x2255cc;
const BTN_EXIT = 0x882222;
const BTN_STROKE = 0x8faaff;

/** Play Screen: title, a real Play button, and how-to lines (§2). */
export class StartScreenView {
  private readonly layout: Layout;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly howTo: Phaser.GameObjects.Text[];
  private readonly buttonG: Phaser.GameObjects.Graphics;
  private readonly buttonLabel: Phaser.GameObjects.Text;
  private sizedFor = -1;

  constructor(scene: Phaser.Scene, layout: Layout) {
    this.layout = layout;
    const base: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontStyle: 'bold',
      align: 'center',
    };

    this.dim = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.5).setOrigin(0);

    this.title = scene.add
      .text(0, 0, 'KNIGHT', {
        ...base,
        fontSize: '48px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0.5);
    this.subtitle = scene.add
      .text(0, 0, 'DUNGEON RUN', {
        ...base,
        fontSize: '24px',
        color: '#ccccee',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0.5);
    this.howTo = [
      scene.add
        .text(0, 0, 'TAP TO JUMP', { ...base, fontStyle: 'normal', fontSize: '16px', color: '#aabbdd' })
        .setOrigin(0.5, 0.5),
      scene.add
        .text(0, 0, 'SWIPE DOWN FOR SHIELD', {
          ...base,
          fontStyle: 'normal',
          fontSize: '16px',
          color: '#aabbdd',
        })
        .setOrigin(0.5, 0.5),
      scene.add
        .text(0, 0, 'DODGE SPIKES AND BATS — SHIELD THE ARROWS', {
          ...base,
          fontStyle: 'normal',
          fontSize: '13px',
          color: '#666688',
        })
        .setOrigin(0.5, 0.5),
    ];
    this.buttonG = scene.add.graphics();
    this.buttonLabel = scene.add
      .text(0, 0, 'PLAY', { ...base, fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5, 0.5);

    this.dim.setDepth(30);
    this.title.setDepth(31);
    this.subtitle.setDepth(31);
    for (const line of this.howTo) line.setDepth(31);
    this.buttonG.setDepth(31);
    this.buttonLabel.setDepth(32);
  }

  update(pulse: number): void {
    const gw = this.layout.gameW;
    const gh = this.layout.gameH;
    const cx = gw / 2;

    if (this.sizedFor !== gw) {
      this.title.setFontSize(`${Math.round(gw * 0.1)}px`);
      this.subtitle.setFontSize(`${Math.round(gw * 0.055)}px`);
      this.howTo[0].setFontSize(`${Math.round(gw * 0.042)}px`);
      this.howTo[1].setFontSize(`${Math.round(gw * 0.042)}px`);
      this.howTo[2].setFontSize(`${Math.round(gw * 0.03)}px`);
      this.buttonLabel.setFontSize(`${Math.round(gw * 0.055)}px`);
      this.sizedFor = gw;
    }

    this.dim.setSize(gw, gh).setPosition(0, 0);
    this.title.setPosition(cx, gh * 0.3);
    this.subtitle.setPosition(cx, gh * 0.4);
    this.howTo[0].setPosition(cx, gh * 0.68);
    this.howTo[1].setPosition(cx, gh * 0.73);
    this.howTo[2].setPosition(cx, gh * 0.79);

    const btn = playButton(gw, gh);
    const r = Math.min(14, btn.h / 3);
    this.buttonG
      .clear()
      .fillStyle(BTN_RESTART, 1)
      .fillRoundedRect(btn.x, btn.y, btn.w, btn.h, r)
      .lineStyle(2, BTN_STROKE, 1)
      .strokeRoundedRect(btn.x, btn.y, btn.w, btn.h, r);
    this.buttonLabel.setPosition(btn.x + btn.w / 2, btn.y + btn.h / 2);
    this.buttonLabel.setAlpha(0.75 + 0.25 * Math.sin(pulse));
  }
}

/** Result Panel: final score, session best, NEW BEST, Restart / Exit (only
 *  reachable from here, §2). */
export class ResultPanelView {
  private readonly layout: Layout;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly overTop: Phaser.GameObjects.Text;
  private readonly overBottom: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly newBest: Phaser.GameObjects.Text;
  private readonly buttonG: Phaser.GameObjects.Graphics;
  private readonly restartLabel: Phaser.GameObjects.Text;
  private readonly exitLabel: Phaser.GameObjects.Text;
  private sizedFor = -1;

  constructor(scene: Phaser.Scene, layout: Layout) {
    this.layout = layout;
    const base: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontStyle: 'bold',
      align: 'center',
    };

    this.dim = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.68).setOrigin(0);

    this.overTop = scene.add
      .text(0, 0, 'GAME', { ...base, fontSize: '48px', color: '#ff4444', stroke: '#000000', strokeThickness: 8 })
      .setOrigin(0.5, 0.5);
    this.overBottom = scene.add
      .text(0, 0, 'OVER', { ...base, fontSize: '48px', color: '#ff4444', stroke: '#000000', strokeThickness: 8 })
      .setOrigin(0.5, 0.5);
    this.scoreText = scene.add
      .text(0, 0, 'SCORE  00000', { ...base, fontStyle: 'normal', fontSize: '24px', color: '#ffffff' })
      .setOrigin(0.5, 0.5);
    this.bestText = scene.add
      .text(0, 0, 'BEST  00000', { ...base, fontStyle: 'normal', fontSize: '18px', color: '#8888aa' })
      .setOrigin(0.5, 0.5);
    this.newBest = scene.add
      .text(0, 0, 'NEW BEST!', { ...base, fontSize: '22px', color: '#ffdd44' })
      .setOrigin(0.5, 0.5);
    this.buttonG = scene.add.graphics();
    this.restartLabel = scene.add
      .text(0, 0, 'RESTART', { ...base, fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5, 0.5);
    this.exitLabel = scene.add
      .text(0, 0, 'EXIT', { ...base, fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5, 0.5);

    this.dim.setDepth(40);
    for (const t of [this.overTop, this.overBottom, this.scoreText, this.bestText, this.newBest, this.restartLabel, this.exitLabel]) {
      t.setDepth(41);
    }
    this.buttonG.setDepth(41);
  }

  update(score: number, hiScore: number, isNewHi: boolean): void {
    const gw = this.layout.gameW;
    const gh = this.layout.gameH;
    const cx = gw / 2;

    if (this.sizedFor !== gw) {
      this.overTop.setFontSize(`${Math.round(gw * 0.11)}px`);
      this.overBottom.setFontSize(`${Math.round(gw * 0.11)}px`);
      this.scoreText.setFontSize(`${Math.round(gw * 0.048)}px`);
      this.bestText.setFontSize(`${Math.round(gw * 0.036)}px`);
      this.newBest.setFontSize(`${Math.round(gw * 0.04)}px`);
      this.restartLabel.setFontSize(`${Math.round(gw * 0.045)}px`);
      this.exitLabel.setFontSize(`${Math.round(gw * 0.045)}px`);
      this.sizedFor = gw;
    }

    this.dim.setSize(gw, gh).setPosition(0, 0);
    this.overTop.setPosition(cx, gh * 0.32);
    this.overBottom.setPosition(cx, gh * 0.43);
    this.scoreText.setPosition(cx, gh * 0.51);
    this.scoreText.setText(`SCORE  ${Math.floor(score).toString().padStart(5, '0')}`);
    this.bestText.setPosition(cx, gh * 0.57);
    this.bestText.setText(`BEST   ${Math.floor(hiScore).toString().padStart(5, '0')}`);
    this.newBest.setPosition(cx, gh * 0.625).setVisible(isNewHi);

    const { restart, exit } = resultButtons(gw, gh);
    const r = Math.min(12, restart.h / 3);
    this.buttonG
      .clear()
      .fillStyle(BTN_RESTART, 1)
      .fillRoundedRect(restart.x, restart.y, restart.w, restart.h, r)
      .lineStyle(2, BTN_STROKE, 1)
      .strokeRoundedRect(restart.x, restart.y, restart.w, restart.h, r)
      .fillStyle(BTN_EXIT, 1)
      .fillRoundedRect(exit.x, exit.y, exit.w, exit.h, r)
      .lineStyle(2, 0xff8888, 1)
      .strokeRoundedRect(exit.x, exit.y, exit.w, exit.h, r);
    labelAt(this.restartLabel, restart);
    labelAt(this.exitLabel, exit);
  }
}

function labelAt(label: Phaser.GameObjects.Text, rect: Rect): void {
  label.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
}
