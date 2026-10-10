// obstacleView.ts — draws spikes, bats and arrows from their model state.
// Animation phases are advanced by the spawner, not here.

import { OBSTACLES } from '../config/gameConfig.ts';
import type { Obstacle } from '../game/obstacles.ts';

type Point2 = { x: number; y: number };

export class ObstacleView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(5);
  }

  update(obstacles: readonly Obstacle[], floorY: number): void {
    const g = this.g;
    g.clear();
    for (const obs of obstacles) {
      if (obs.type === 'spike_cluster') this.drawSpikes(obs, floorY);
      else if (obs.type === 'flyer') this.drawBat(obs);
      else this.drawArrow(obs);
    }
  }

  private drawSpikes(obs: Obstacle, floorY: number): void {
    const count = obs.spikeCount ?? 1;
    const h = obs.spikeH ?? 32;
    const overlap = OBSTACLES.SPIKE_OVERLAP;
    const g = this.g;

    for (let i = 0; i < count; i++) {
      const sx = obs.x + i * (OBSTACLES.SPIKE_W - overlap);
      const hh = i % 2 === 0 ? h : h * 0.82;
      const x1 = sx;
      const y1 = floorY;
      const x2 = sx + OBSTACLES.SPIKE_W / 2;
      const y2 = floorY - hh;
      const x3 = sx + OBSTACLES.SPIKE_W;
      const y3 = floorY;

      g.fillStyle(0x8888aa, 1);
      g.fillTriangle(x1, y1, x2, y2, x3, y3);
      g.lineStyle(1.5, 0x555577, 1);
      g.strokeTriangle(x1, y1, x2, y2, x3, y3);
    }
  }

  private drawBat(obs: Obstacle): void {
    const wingBeat = Math.sin(obs.flyPhase ?? 0) * 8;
    const cx = obs.x + OBSTACLES.BAT_CENTER_DX;
    const cy = (obs.flyY ?? 0) + OBSTACLES.BAT_CENTER_DY;
    const g = this.g;

    g.fillStyle(0x7766bb, 1);
    g.fillPoints(this.wingPoints(cx, cy, wingBeat, -1), true);
    g.fillPoints(this.wingPoints(cx, cy, wingBeat, 1), true);

    g.fillStyle(0x5544aa, 1).fillEllipse(cx, cy, 14, 10);

    g.fillStyle(0xff4444, 1);
    g.fillRect(cx - 3, cy - 3, 2, 2);
    g.fillRect(cx + 1, cy - 3, 2, 2);
  }

  private wingPoints(cx: number, cy: number, beat: number, dir: number): Point2[] {
    const pts: Point2[] = [];
    const curve = (p0: Point2, c: Point2, p1: Point2, skipFirst: boolean): void => {
      for (let i = skipFirst ? 1 : 0; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        pts.push({
          x: cx + dir * (u * u * p0.x + 2 * u * t * c.x + t * t * p1.x),
          y: cy + u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
        });
      }
    };

    curve({ x: 0, y: 0 }, { x: -18, y: -10 - beat }, { x: -22, y: 2 }, false);
    curve({ x: -22, y: 2 }, { x: -14, y: 4 - beat * 0.3 }, { x: 0, y: 2 }, true);
    return pts;
  }

  /** One arrow of a vertical stack — flies leftwards, head points left. */
  private drawArrow(obs: Obstacle): void {
    const g = this.g;
    const w = OBSTACLES.ARROW_W;
    const h = OBSTACLES.ARROW_H;
    const x = obs.x;
    const top = obs.arrowY ?? 0;
    const cy = top + h / 2;

    // Motion streaks trailing behind (to the right).
    g.lineStyle(2, 0xff7850, 0.5);
    g.lineBetween(x + w + 6, cy - 4, x + w + 15, cy - 4);
    g.lineBetween(x + w + 10, cy + 4, x + w + 21, cy + 4);

    // Shaft
    g.fillStyle(0xccd0dd, 1);
    g.fillRect(x + 8, cy - 2, w - 8, 4);

    // Head — points left, the direction of travel.
    g.fillStyle(0xff6644, 1);
    g.fillTriangle(x, cy, x + 9, cy - 6, x + 9, cy + 6);
    g.lineStyle(1, 0x7a2a18, 1);
    g.strokeTriangle(x, cy, x + 9, cy - 6, x + 9, cy + 6);

    // Fletching at the tail.
    g.fillStyle(0xff9955, 1);
    g.fillTriangle(x + w, cy - 2, x + w - 8, cy - 7, x + w - 8, cy - 2);
    g.fillTriangle(x + w, cy + 2, x + w - 8, cy + 7, x + w - 8, cy + 2);
  }
}
