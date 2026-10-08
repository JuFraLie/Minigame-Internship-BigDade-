import Phaser from 'phaser';
import type { OverlayLayout } from '../layout/Layout.ts';
import { bakePlank, FIELD_ROWS, PANEL_ROWS } from '../art/PanelArt.ts';
import { CYAN_HEX, INK, INK_HEX, SLATE } from '../palette.ts';
import { FONT_BODY, FONT_HEAD } from '../fonts.ts';

const DEPTH = 35;

/** Only this overlay wears these two, so they are cut under its own keys. */
const SIGN_PLANK = 'pause_sign';
const RESUME_PLANK = 'resume_button';

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
    const signY = layout.height * 0.38;
    const signFont = Math.max(30, 46 * unit);
    // A label centred on a plank lands on its field, which is `FIELD_ROWS` of
    // `PANEL_ROWS` - so the sign is cut for the word it has to carry rather
    // than guessed at.
    const signH = Math.ceil((signFont * PANEL_ROWS * 1.15) / FIELD_ROWS);
    const signW = Math.min(layout.width - 70 * unit, 340 * unit);

    // Screen-space, like the HUD: the camera is still following the player
    // behind the overlay, so world coordinates would put the panel off-screen.
    this.add(
      this.scene.add
        .rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, INK_HEX, 0.9)
        .setScrollFactor(0)
        .setDepth(DEPTH)
        .setInteractive(),
    );

    // Cut before anything draws them: `add.image` resolves the texture on the
    // spot, and every resize comes back through here via `applyLayout`.
    bakePlank(this.scene, SIGN_PLANK, signW, signH);
    bakePlank(this.scene, RESUME_PLANK, buttonW, buttonH, {
      color: CYAN_HEX,
      width: Math.round(6 * unit),
    });

    this.add(
      this.scene.add
        .image(layout.width / 2, signY, SIGN_PLANK)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );

    this.add(
      this.scene.add
        .text(layout.width / 2, signY, 'PAUSED', {
          fontFamily: FONT_HEAD,
          fontSize: `${signFont}px`,
          // Ink on the sign, the way every card carries its title.
          color: INK,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2),
    );

    const box = this.scene.add
      .image(layout.width / 2, buttonY, RESUME_PLANK)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setInteractive({ useHandCursor: true });
    this.add(box);

    const label = this.scene.add
      .text(layout.width / 2, buttonY, 'RESUME', {
        fontFamily: FONT_HEAD,
        fontSize: `${Math.max(18, 24 * unit)}px`,
        color: INK,
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
