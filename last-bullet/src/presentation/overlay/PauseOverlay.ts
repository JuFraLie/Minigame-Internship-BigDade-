import Phaser from 'phaser';
import type { OverlayLayout } from '../layout/Layout.ts';
import { CARD_HEX, CYAN, CYAN_HEX, INK_HEX, PAPER, SLATE } from '../palette.ts';

const DEPTH = 35;
const FONT_HEAD = '"Arial Black", Impact, sans-serif';
const FONT_BODY = 'Arial, Helvetica, sans-serif';

/**
 * Pause. It resumes, and nothing else.
 *
 * Deliberately has no restart and no exit: per AGENTS.md section 2 the score
 * must be finalised on the Result Panel before the player can leave, so the
 * only way out of a round is to finish it.
 */
export class PauseOverlay {
  private readonly scene: Phaser.Scene;
  private readonly onResume: () => void;

  private layout: OverlayLayout;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private open = false;

  constructor(scene: Phaser.Scene, layout: OverlayLayout, onResume: () => void) {
    this.scene = scene;
    this.layout = layout;
    this.onResume = onResume;
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.render();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    for (const object of this.objects) object.destroy();
    this.objects = [];
  }

  applyLayout(layout: OverlayLayout): void {
    this.layout = layout;
    if (!this.open) return;
    this.hide();
    this.show();
  }

  private render(): void {
    const layout = this.layout;
    const unit = layout.unit;
    const buttonW = Math.min(layout.width - 80 * unit, 280 * unit);
    const buttonH = 60 * unit;
    const buttonY = layout.height * 0.6;

    // Screen-space, like the HUD: the camera is still following the player
    // behind the overlay, so world coordinates would put the panel off-screen.
    this.add(
      this.scene.add
        .rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, INK_HEX, 0.9)
        .setScrollFactor(0)
        .setDepth(DEPTH)
        .setInteractive(),
    );

    this.add(
      this.scene.add
        .text(layout.width / 2, layout.height * 0.38, 'PAUSED', {
          fontFamily: FONT_HEAD,
          fontSize: `${Math.max(30, 46 * unit)}px`,
          color: PAPER,
          stroke: '#0b0f1a',
          strokeThickness: 7,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );

    const box = this.scene.add
      .rectangle(layout.width / 2, buttonY, buttonW, buttonH, CARD_HEX, 1)
      .setStrokeStyle(Math.max(2, Math.round(3 * unit)), CYAN_HEX, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setInteractive({ useHandCursor: true });
    this.add(box);

    const label = this.scene.add
      .text(layout.width / 2, buttonY, 'RESUME', {
        fontFamily: FONT_HEAD,
        fontSize: `${Math.max(18, 24 * unit)}px`,
        color: CYAN,
        stroke: '#0b0f1a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 2);
    this.add(label);

    this.add(
      this.scene.add
        .text(
          layout.width / 2,
          buttonY + buttonH + 34 * unit,
          'Finish the round to reach Retry and Exit.',
          {
            fontFamily: FONT_BODY,
            fontSize: `${Math.max(11, 14 * unit)}px`,
            color: SLATE,
          },
        )
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );

    box.on('pointerdown', () => this.onResume());
    box.on('pointerover', () => box.setScale(1.02));
    box.on('pointerout', () => box.setScale(1));
  }

  private add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }
}
