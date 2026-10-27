/**
 * The pause affordance of the round: the corner pause button and the resume
 * overlay. Split out of the Game scene so the scene only wires callbacks
 * (separation of concerns).
 *
 * Resume only — no restart, no exit (AGENTS.md §2). This module only
 * assembles the two controls: where they go comes from ./layout.ts, colours
 * and fonts from ./theme.ts, the gradient button from ./ui.ts.
 * `build()` is re-run whenever the viewport changes.
 */

import type Phaser from 'phaser';
import { pauseLayout } from './layout.ts';
import { FONT, THEME } from './theme.ts';
import { makeButton } from './ui.ts';
import type { Viewport } from './viewport.ts';

export interface PauseMenuOptions {
    /** The corner pause button was pressed. */
    onPause: () => void;
    /** The RESUME button in the overlay was pressed. */
    onResume: () => void;
}

export class PauseMenu {
    private readonly scene: Phaser.Scene;
    private readonly onPause: () => void;
    private readonly onResume: () => void;

    /** The button — the scene's display list, outside the overlay container. */
    private buttonParts: { image: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text } | null = null;
    private overlay: Phaser.GameObjects.Container | null = null;

    constructor(scene: Phaser.Scene, options: PauseMenuOptions) {
        this.scene = scene;
        this.onPause = options.onPause;
        this.onResume = options.onResume;
    }

    /** (Re)build the pause button and the overlay for the given viewport. */
    build(viewport: Viewport): void {
        this.destroy();
        const { width: w, height: h } = viewport;
        const layout = pauseLayout(viewport);
        const s = this.scene;

        // Pause button — just under the HUD band, clear of any cutout.
        const btn = s.add.circle(
            layout.pauseButtonX, layout.pauseButtonY, layout.pauseButtonSize / 2, THEME.pauseButton,
        ).setInteractive({ useHandCursor: true });
        const label = s.add.text(layout.pauseButtonX, layout.pauseButtonY, 'II', {
            fontFamily: FONT,
            fontSize: `${layout.pauseButtonFontSize}px`,
            fontStyle: 'bold',
            color: THEME.buttonLabel,
        }).setOrigin(0.5);
        btn.on('pointerdown', this.onPause);
        this.buttonParts = { image: btn, label };

        // Overlay: dim + PAUSED + a single Resume action.
        this.overlay = s.add.container(0, 0).setVisible(false);
        const dim = s.add.rectangle(w / 2, h / 2, w, h, THEME.pauseDim, 0.7);
        const title = s.add.text(w / 2, layout.labelY, 'PAUSED', {
            fontFamily: FONT,
            fontSize: `${layout.labelSize}px`,
            fontStyle: 'bold',
            color: THEME.paused,
            stroke: THEME.pausedStroke,
            strokeThickness: Math.max(3, Math.round(w * 0.014)),
        }).setOrigin(0.5);

        const resume = makeButton(s, {
            x: w / 2,
            y: layout.resumeY,
            width: layout.resumeWidth,
            height: layout.resumeHeight,
            gradient: THEME.resume,
            label: 'RESUME',
            fontSize: layout.resumeFontSize,
        });
        resume.image.on('pointerdown', this.onResume);
        this.overlay.add([dim, title, resume.image, resume.label]);
    }

    /** Show or hide the overlay (the pause button stays as-is). */
    setVisible(visible: boolean): void {
        this.overlay?.setVisible(visible);
    }

    /** Drop every object this menu owns. */
    destroy(): void {
        if (this.buttonParts) {
            this.buttonParts.image.destroy();
            this.buttonParts.label.destroy();
            this.buttonParts = null;
        }
        this.overlay?.destroy();
        this.overlay = null;
    }
}
