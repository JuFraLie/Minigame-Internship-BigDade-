/**
 * MainMenu — the Play Screen (AGENTS.md §2).
 *
 * Shows the title, a Play button, and a 2-sentence how-to. Tapping anywhere
 * also starts. Fires `launch` (once per session, guarded inside the bridge
 * adapter) and then hands over to the Game scene.
 *
 * Layout is in design units (CSS pixels of the window); the camera zoom makes
 * the canvas sharp on a high-density phone. Fonts scale with the width, so any
 * portrait phone from a small 720p to a tall 21:9 gets a sensible layout.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { applyRenderScale, measureViewport, VIEWPORT_CHANGED } from '../adapters/phaser/viewport.ts';

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
        const { width: w, height: h, safeTop } = measureViewport();

        this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);

        const titleSize = Math.round(w * 0.11);
        const bodySize = Math.round(w * 0.045);

        // The title starts below the real cutout/status-bar inset.
        const titleY = Math.max(h * 0.28, safeTop + titleSize * 1.5);
        this.add.text(w / 2, titleY, 'BRICK SURGE', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${titleSize}px`,
            fontStyle: 'bold',
            color: '#ffd23f',
        }).setOrigin(0.5);

        this.add.text(w / 2, titleY + h * 0.1, 'Drag to move the paddle.\nCatch the glowing drops!', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${bodySize}px`,
            color: '#ffffff',
            align: 'center',
            lineSpacing: 8,
        }).setOrigin(0.5);

        // Play button — a clear start action, as required by the flow. Big
        // enough for a thumb: ~50% of width, ~8% of height.
        const btnY = titleY + h * 0.28;
        const btnW = w * 0.5;
        const btnH = Math.max(h * 0.07, 44); // never below the ~44pt touch target
        const btn = this.add.rectangle(w / 2, btnY, btnW, btnH, 0x36a2eb).setInteractive({ useHandCursor: true });
        this.add.text(w / 2, btnY, 'PLAY', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.06)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        const start = (): void => {
            if (this.started) return;
            this.started = true;
            // `launch` fires here — exactly once, after the player presses Play.
            this.ctx.bridge.signalLaunch();
            this.scene.start('Game', { ctx: this.ctx });
        };

        btn.on('pointerdown', start);
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
