// hud.ts — in-run overlay: ONE row on the screen-safe top edge.
// Health (hearts, left) and the score (right) share a single centre line, with
// the HI score riding the same baseline in smaller grey type and the coin
// count tucked in right after the hearts.
// The geometry lives in core/uiLayout.ts → hudLayout; this view only turns it
// into Phaser objects. `topInset` is the screen-safe top edge.

import { hudLayout } from '../core/uiLayout.ts';
import type { Layout } from '../core/types.ts';

const HEART_TOP = -1.1;
const HEART_BOTTOM = 0.6;

export class Hud {
  private readonly layout: Layout;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly hiText: Phaser.GameObjects.Text;
  private readonly coinText: Phaser.GameObjects.Text;
  private readonly g: Phaser.GameObjects.Graphics;
  private sizedFor = -1;
  private lastHearts = -1;
  private lastMaxHearts = -1;
  private lastCoins = -1;

  constructor(scene: Phaser.Scene, layout: Layout) {
    this.layout = layout;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ffffff',
    };
    this.scoreText = scene.add.text(0, 0, '', { ...style, fontSize: '16px' }).setOrigin(1, 0);
    this.hiText = scene.add
      .text(0, 0, '', { ...style, fontSize: '16px', color: '#8888aa' })
      .setOrigin(1, 0);
    this.coinText = scene.add
      .text(0, 0, '', { ...style, fontSize: '16px', color: '#ffdf00' })
      .setOrigin(0, 0);
    this.g = scene.add.graphics();
    this.scoreText.setDepth(20);
    this.hiText.setDepth(20);
    this.coinText.setDepth(20);
    this.g.setDepth(19);
  }

  update(score: number, hiScore: number, hearts: number, maxHearts: number, coins: number): void {
    const gw = this.layout.gameW;
    const top = this.layout.topInset;
    const l = hudLayout(gw, top);

    if (this.sizedFor !== gw) {
      this.scoreText.setFontSize(l.fontSize);
      this.hiText.setFontSize(l.hiFontSize);
      this.coinText.setFontSize(l.coinFontSize);
      this.sizedFor = gw;
      this.lastHearts = -1; // force a redraw of the row graphics
    }

    this.scoreText.setPosition(l.textRight, l.baselineY - l.fontSize);
    this.scoreText.setText(Math.floor(score).toString().padStart(5, '0'));

    // HI sits left of the score on the same baseline, right-aligned to its slot.
    const scoreW = l.fontSize * 0.6 * 5;
    this.hiText.setVisible(hiScore > 0);
    if (hiScore > 0) {
      this.hiText.setPosition(l.textRight - scoreW - l.hiGap, l.baselineY - l.hiFontSize);
      this.hiText.setText(`HI ${Math.floor(hiScore).toString().padStart(5, '0')}`);
    }

    this.coinText.setPosition(l.coinTextX, l.baselineY - l.coinFontSize);
    const coinLabel = `x${coins}`;
    if (coinLabel !== this.coinText.text) this.coinText.setText(coinLabel);

    if (hearts !== this.lastHearts || maxHearts !== this.lastMaxHearts || coins !== this.lastCoins) {
      this.lastHearts = hearts;
      this.lastMaxHearts = maxHearts;
      this.lastCoins = coins;
      this.drawRow(l, hearts, maxHearts);
    }
  }

  private drawRow(
    l: ReturnType<typeof hudLayout>,
    hearts: number,
    maxHearts: number,
  ): void {
    const g = this.g;
    g.clear();

    // Hearts, centred on the digits' optical centre.
    const anchorY = l.centerY - ((HEART_TOP + HEART_BOTTOM) / 2) * l.heartSize;
    for (let i = 0; i < maxHearts; i++) {
      this.drawHeart(l.firstHeartX + i * l.heartSpacing, anchorY, l.heartSize, i < hearts);
    }

    // Coin icon after the hearts block, on the same centre line.
    this.drawCoin(l.coinX, l.centerY, l.coinRadius);
  }

  private drawHeart(x: number, y: number, s: number, full: boolean): void {
    const g = this.g;
    const pts: { x: number; y: number }[] = [];
    const top = HEART_TOP * s;
    const bottom = HEART_BOTTOM * s;
    // Sample the two bezier lobes of the canvas heart into a polygon.
    const bez = (
      p0x: number,
      p0y: number,
      c0x: number,
      c0y: number,
      c1x: number,
      c1y: number,
      p1x: number,
      p1y: number,
    ): void => {
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        pts.push({
          x: x + u * u * u * p0x + 3 * u * u * t * c0x + 3 * u * t * t * c1x + t * t * t * p1x,
          y: y + u * u * u * p0y + 3 * u * u * t * c0y + 3 * u * t * t * c1y + t * t * t * p1y,
        });
      }
    };
    bez(0, bottom, -s * 1.2, -s * 0.2, -s * 1.1, top, 0, -s * 0.5);
    bez(0, -s * 0.5, s * 1.1, top, s * 1.2, -s * 0.2, 0, bottom);

    if (full) {
      g.fillStyle(0xff3366, 1);
      g.fillPoints(pts, true);
      g.lineStyle(1, 0xff99aa, 1);
    } else {
      g.fillStyle(0x3c2832, 0.5);
      g.fillPoints(pts, true);
      g.lineStyle(1.2, 0x554444, 1);
    }
    // Graphics has no strokePoints — close the outline with segments.
    for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    g.lineBetween(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);

    if (full) {
      g.fillStyle(0xffffff, 0.7);
      g.fillEllipse(x - s * 0.35, y - s * 0.5, s * 0.4, s * 0.2);
    }
  }

  private drawCoin(x: number, y: number, r: number): void {
    const g = this.g;
    g.fillStyle(0xf5b041, 1);
    g.fillCircle(x, y, r);
    g.lineStyle(1.2, 0xd4ac0d, 1);
    g.strokeCircle(x, y, r);
    g.fillStyle(0xf9e79f, 1);
    g.fillCircle(x, y, r * 0.65);
  }
}
