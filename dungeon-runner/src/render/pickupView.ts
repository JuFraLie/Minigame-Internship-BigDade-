// pickupView.ts — draws the coins and hearts from their model state.
// Pure rendering: it reads Pickup state and mutates nothing — every animation
// clock (spin, bob) is ticked by the simulation in game/pickups.ts.

import type { Pickup } from '../game/pickups.ts';

export class PickupView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(4);
  }

  update(pickups: readonly Pickup[]): void {
    const g = this.g;
    g.clear();
    for (const p of pickups) {
      if (!p.active) continue;
      if (p.type === 'coin') this.drawCoin(p.x, p.y, p.radius, p.animPhase);
      else this.drawHeart(p.x, p.y, p.radius, p.animPhase);
    }
  }

  private drawCoin(x: number, y: number, r: number, animPhase: number): void {
    const g = this.g;
    // Spin illusion: squash the disc horizontally as it turns edge-on.
    const c = Math.cos(animPhase);
    const sx = Math.abs(c) < 0.1 ? 0.1 : Math.abs(c);

    // Outer rim (ellipse via scale: draw circle then scale points manually)
    g.fillStyle(0xf5b041, 1);
    this.fillEllipse(g, x, y, r * sx, r);
    g.lineStyle(1.5, 0xd4ac0d, 1);
    this.strokeEllipse(g, x, y, r * sx, r);

    // Inner face
    g.fillStyle(0xf9e79f, 1);
    this.fillEllipse(g, x, y, r * 0.72 * sx, r * 0.72);

    // Diamond emblem
    g.fillStyle(0xd4ac0d, 1);
    g.fillPoints(
      [
        { x, y: y - r * 0.45 },
        { x: x + r * 0.35 * sx, y },
        { x, y: y + r * 0.45 },
        { x: x - r * 0.35 * sx, y },
      ],
      true,
    );

    // Shine
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(x - r * 0.25 * sx, y - r * 0.25, r * 0.2 * sx);
  }

  private drawHeart(x: number, y: number, r: number, animPhase: number): void {
    const g = this.g;
    const pulse = 1 + Math.sin(animPhase * 2) * 0.08;
    const s = r * 0.9 * pulse;

    // Soft glow
    g.fillStyle(0xff4646, 0.25);
    g.fillCircle(x, y, s * 1.5);

    // Heart path: two-lobe bezier sampled into a polygon
    g.fillStyle(0xff4d6d, 1);
    g.fillPoints(this.heartPoints(x, y, s), true);
    g.lineStyle(1.2, 0xfff0f3, 1);
  }

  private heartPoints(x: number, y: number, s: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const bez = (
      p0: { x: number; y: number },
      c0: { x: number; y: number },
      c1: { x: number; y: number },
      p1: { x: number; y: number },
    ): void => {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        pts.push({
          x: x + u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
          y: y + u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y,
        });
      }
    };
    bez({ x: 0, y: s * 0.6 }, { x: -s * 1.2, y: -s * 0.2 }, { x: -s * 1.1, y: -s * 1.1 }, { x: 0, y: -s * 0.5 });
    bez({ x: 0, y: -s * 0.5 }, { x: s * 1.1, y: -s * 1.1 }, { x: s * 1.2, y: -s * 0.2 }, { x: 0, y: s * 0.6 });
    return pts;
  }

  private fillEllipse(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    rx: number,
    ry: number,
  ): void {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
    }
    g.fillPoints(pts, true);
  }

  private strokeEllipse(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    rx: number,
    ry: number,
  ): void {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
    }
    // Graphics has no strokePoints — approximate with segments.
    for (let i = 0; i < pts.length - 1; i++) {
      g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
  }
}
