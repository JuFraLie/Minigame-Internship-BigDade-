/**
 * MainMenu — the Play Screen (AGENTS.md §2).
 *
 * Shows the title, a Play button, and a short how-to in Bahasa Indonesia.
 * Tapping anywhere also starts. Fires `launch` (once per session, guarded
 * inside the bridge adapter) and then hands over to the Game scene.
 *
 * The scene only wires things together: viewport.ts measures the screen,
 * layout.ts says where each element goes (and how wide the how-to may be),
 * theme.ts provides colours and fonts, ui.ts draws the gradient button.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { applyRenderScale, measureViewport, VIEWPORT_CHANGED } from '../adapters/phaser/viewport.ts';
import { menuLayout } from '../adapters/phaser/layout.ts';
import { backdrop, makeButton, makeIconButton, soundGlyph } from '../adapters/phaser/ui.ts';
import { FONT, THEME } from '../adapters/phaser/theme.ts';

/**
 * The how-to: two short sentences in Bahasa Indonesia. On a narrow phone the
 * old long English line ran off both edges of the screen — layout.ts caps the
 * wrap width, so every line now stays inside the playfield.
 */
const HOW_TO = [
    'Geser jari untuk menggerakkan paddle.',
    'Tangkap tetesan kuning untuk menambah bola!',
].join('\n');

export class MainMenu extends Phaser.Scene {
    constructor() {
        super('MainMenu');
    }

    init(data?: { ctx: AppContext }): void {
        // The first scene auto-starts without data — fall back to the registry
        // where the composition root stashed the shared context.
        this.ctx = data?.ctx ?? this.registry.get('ctx');
    }

    private ctx!: AppContext;
    /** Guards against a double-tap firing start twice (button + anywhere). */
    private started = false;

    create(): void {
        this.started = false;
        applyRenderScale(this);
        const viewport = measureViewport();
        const { width: w, height: h } = viewport;
        const layout = menuLayout(viewport);

        backdrop(this, w, h);

        // Sound toggle — top-left corner, below the cutout and clear of the
        // centred title (layout.ts guarantees both).
        const soundButton = makeIconButton(this, {
            x: layout.soundButtonX,
            y: layout.soundButtonY,
            size: layout.soundButtonSize,
            color: THEME.pauseButton,
            glyph: soundGlyph(this.ctx.sound.muted),
            fontSize: Math.round(layout.soundButtonSize * 0.55),
        });
        soundButton.image.on('pointerdown', () => {
            // Flip first: unmuting can then confirm with a click, muting
            // silences that same click — either way the feedback matches.
            this.ctx.sound.setMuted(!this.ctx.sound.muted);
            soundButton.label.setText(soundGlyph(this.ctx.sound.muted));
            this.ctx.sound.play('click');
        });

        this.add.text(w / 2, layout.titleY, 'BRICKSURGE', {
            fontFamily: FONT,
            fontSize: `${layout.titleSize}px`,
            fontStyle: 'bold',
            color: THEME.title,
            stroke: THEME.titleStroke,
            strokeThickness: Math.max(2, Math.round(layout.titleSize * 0.08)),
        }).setOrigin(0.5);

        this.add.text(w / 2, layout.howToY, HOW_TO, {
            fontFamily: FONT,
            fontSize: `${layout.howToSize}px`,
            color: THEME.howTo,
            align: 'center',
            lineSpacing: 8,
            wordWrap: { width: layout.howToWrapWidth },
        }).setOrigin(0.5);

        // Play button — a clear start action, as required by the flow. Big
        // enough for a thumb: ~50% of width, ~8% of height (layout.ts).
        const play = makeButton(this, {
            x: w / 2,
            y: layout.playY,
            width: layout.playWidth,
            height: layout.playHeight,
            gradient: THEME.play,
            label: 'PLAY',
            fontSize: layout.playFontSize,
            labelColor: THEME.buttonLabelWarm,
        });

        const start = (): void => {
            if (this.started) return;
            this.started = true;
            // First tap of the run: start the audio device inside the gesture
            // (window capture in main.ts usually beat us to it — belt and braces).
            this.ctx.sound.unlock();
            this.ctx.sound.play('click');
            // `launch` fires here — exactly once, after the player presses Play.
            this.ctx.bridge.signalLaunch();
            this.scene.start('Game', { ctx: this.ctx });
        };

        play.image.on('pointerdown', start);
        // Tapping anywhere on the Play Screen also starts the game.
        this.input.on('pointerdown', start);

        // Keep the layout sane if the WebView settles late or the URL bar moves.
        this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this);
        this.events.once('shutdown', () => {
            this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this);
        });
    }

    /** A fresh create() re-measures and re-lays everything out. */
    private onViewportChanged(): void {
        this.scene.restart();
    }
}
