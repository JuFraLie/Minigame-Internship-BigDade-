import Phaser from 'phaser';
import type { GameLayout } from '../layout/Layout.ts';
import { TIMING } from '../reveal/RevealTimeline.ts';
import { CREAM, INK } from '../art/palette.ts';

/** Number of sparks in the tie burst. */
const SPARK_COUNT = 6;

/**
 * One-shot visual feedback: the things that exist for a moment and are gone.
 *
 * Card lift, badge flip, enemy pop, floating points, the tie burst and the
 * camera punch all live here so the scene never has to know how a tween is
 * built — it says "the player won" and this class makes the screen answer.
 */
export class GameFx {
  private readonly scene: Phaser.Scene;
  private readonly sparks: Phaser.GameObjects.Image[];
  private layout!: GameLayout;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sparks = Array.from({ length: SPARK_COUNT }, () =>
      scene.add.image(0, 0, 'spark').setOrigin(0.5).setVisible(false),
    );
  }

  applyLayout(layout: GameLayout): void {
    this.layout = layout;
    this.sparks.forEach((spark) => spark.setScale(0.5 * layout.unit));
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  liftCard(card: Phaser.GameObjects.Image): void {
    this.scene.tweens.killTweensOf(card);
    this.scene.tweens.add({
      targets: card,
      y: card.y - 34 * this.layout.unit,
      duration: 140,
      ease: 'Quad.easeOut',
    });
  }

  lowerCard(card: Phaser.GameObjects.Image, restY: number): void {
    this.scene.tweens.killTweensOf(card);
    this.scene.tweens.add({
      targets: card,
      y: restY,
      duration: 160,
      ease: 'Quad.easeIn',
    });
  }

  // ── Enemy ──────────────────────────────────────────────────────────────────

  /** Half-turns the badge over and swaps its face at the halfway point. */
  flipBadge(badge: Phaser.GameObjects.Image, key: string, restScale: number): void {
    this.scene.tweens.killTweensOf(badge);
    this.scene.tweens.add({
      targets: badge,
      scaleY: restScale * 0.06,
      duration: TIMING.FLIP_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        badge.setTexture(key);
        this.scene.tweens.add({
          targets: badge,
          scaleY: restScale,
          duration: TIMING.FLIP_MS,
          ease: 'Quad.easeOut',
        });
      },
    });
  }

  /** Defeated: the enemy blows up out of the screen. */
  popEnemy(enemy: Phaser.GameObjects.Container): void {
    this.scene.tweens.killTweensOf(enemy);
    this.scene.tweens.add({
      targets: enemy,
      scale: 1.4,
      alpha: 0,
      duration: 280,
      ease: 'Quad.easeIn',
    });
  }

  /** A fresh enemy steps in. */
  spawnIn(enemy: Phaser.GameObjects.Container): void {
    enemy.setAlpha(1).setScale(0.35);
    this.scene.tweens.killTweensOf(enemy);
    this.scene.tweens.add({
      targets: enemy,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });
  }

  // ── Impacts ────────────────────────────────────────────────────────────────

  /** `+100  ×3` rises off the defeated enemy and fades. */
  floatPoints(points: number, multiplier: number): void {
    const { x, y } = this.layout.enemy.center;
    const label = multiplier > 1 ? `+${points}  ×${multiplier}` : `+${points}`;
    const text = this.scene.add.text(x, y, label, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.max(22, 34 * this.layout.unit)}px`,
      color: CREAM,
      stroke: INK,
      strokeThickness: 7,
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: y - 90 * this.layout.unit,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /** Tie: a small ring of sparks around the enemy. */
  burstSparks(): void {
    const { x, y } = this.layout.enemy.center;
    this.sparks.forEach((spark, i) => {
      const angle = (Math.PI * 2 * i) / this.sparks.length;
      const distance = (60 + i * 9) * this.layout.unit;
      this.scene.tweens.killTweensOf(spark);
      spark.setPosition(x, y).setScale(0.4 * this.layout.unit).setAlpha(1).setVisible(true);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        scale: 0,
        alpha: 0,
        duration: 460,
        ease: 'Quad.easeOut',
      });
    });
  }

  flashWin(): void {
    // A soft sage bloom rather than a hard white flash: on paper the win
    // should feel like light coming in, not the screen blowing out.
    this.scene.cameras.main.flash(150, 168, 236, 205, false);
  }

  shakeLose(): void {
    this.scene.cameras.main.shake(TIMING.SHAKE_MS, 0.012);
  }
}
