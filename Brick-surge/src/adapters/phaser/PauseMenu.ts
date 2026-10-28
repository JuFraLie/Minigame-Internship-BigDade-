/**
 * The pause affordance of the round: the corner pause button and the resume
 * overlay (which also carries the sound toggle). Split out of the Game scene
 * so the scene only wires callbacks (separation of concerns).
 *
 * Resume only — no restart, no exit (AGENTS.md §2). This module only
 * assembles the controls: where they go comes from ./layout.ts, colours and
 * fonts from ./theme.ts, the buttons from ./ui.ts. `build()` is re-run
 * whenever the viewport changes.
 */

import type Phaser from 'phaser';
import type { SoundPort } from '../../domain/ports.ts';
import { pauseLayout } from './layout.ts';
import { FONT, THEME } from './theme.ts';
import { makeButton, makeIconButton, soundGlyph, type IconParts } from './ui.ts';
import type { Viewport } from './viewport.ts';

export interface PauseMenuOptions {
    /** The corner pause button was pressed. */
    onPause: () => void;
    /** The RESUME button in the overlay was pressed. */
    onResume: () => void;
    /** Sound device — click feedback and the mute toggle live here. */
    sound: SoundPort;
}

export class PauseMenu {
    private readonly scene: Phaser.Scene;
    private readonly onPause: () => void;
    private readonly onResume: () => void;
    private readonly sound: SoundPort;

    /** The button — the scene's display list, outside the overlay container. */
    private buttonParts: IconParts | null = null;
    private overlay: Phaser.GameObjects.Container | null = null;
    private soundLabel: Phaser.GameObjects.Text | null = null;

    constructor(scene: Phaser.Scene, options: PauseMenuOptions) {
        this.scene = scene;
        this.onPause = options.onPause;
        this.onResume = options.onResume;
        this.sound = options.sound;
    }

    /** (Re)build the pause button and the overlay for the given viewport. */
    build(viewport: Viewport): void {
        this.destroy();
        const { width: w, height: h } = viewport;
        const layout = pauseLayout(viewport);
        const s = this.scene;

        // Pause button — just under the HUD band, clear of any cutout.
        this.buttonParts = makeIconButton(s, {
            x: layout.pauseButtonX,
            y: layout.pauseButtonY,
            size: layout.pauseButtonSize,
            color: THEME.pauseButton,
            glyph: 'II',
            fontSize: layout.pauseButtonFontSize,
        });
        this.buttonParts.image.on('pointerdown', () => {
            this.sound.play('click');
            this.onPause();
        });

        // Overlay: dim + PAUSED + Resume + the sound toggle.
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
        resume.image.on('pointerdown', () => {
            this.sound.play('click');
            this.onResume();
        });

        const soundButton = makeIconButton(s, {
            x: layout.soundButtonX,
            y: layout.soundButtonY,
            size: layout.soundButtonSize,
            color: THEME.pauseButton,
            glyph: soundGlyph(this.sound.muted),
            fontSize: Math.round(layout.soundButtonSize * 0.55),
        });
        this.soundLabel = soundButton.label;
        soundButton.image.on('pointerdown', () => {
            // Flip first: unmuting can then confirm with a click, muting
            // silences that same click — either way the feedback matches.
            this.sound.setMuted(!this.sound.muted);
            this.soundLabel?.setText(soundGlyph(this.sound.muted));
            this.sound.play('click');
        });

        this.overlay.add([
            dim, title, resume.image, resume.label,
            soundButton.image, soundButton.label,
        ]);
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
        this.soundLabel = null;
    }
}
