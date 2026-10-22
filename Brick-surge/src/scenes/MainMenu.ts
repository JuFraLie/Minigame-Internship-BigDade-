/**
 * MainMenu — the Play Screen (AGENTS.md §2).
 *
 * Shows the title, a Play button, and a 2-sentence how-to. Tapping anywhere
 * also starts. Fires `launch` (once per session, guarded inside the bridge
 * adapter) and then hands over to the Game scene.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';

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

    create(): void {
        const w = this.scale.width;
        const h = this.scale.height;

        this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);

        const titleSize = Math.round(w * 0.11);
        const bodySize = Math.round(w * 0.045);

        this.add.text(w / 2, h * 0.28, 'BRICK SURGE', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${titleSize}px`,
            fontStyle: 'bold',
            color: '#ffd23f',
        }).setOrigin(0.5);

        this.add.text(w / 2, h * 0.42, 'Drag to move the paddle.\nCatch the glowing drops!', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${bodySize}px`,
            color: '#ffffff',
            align: 'center',
            lineSpacing: 8,
        }).setOrigin(0.5);

        // Play button — a clear start action, as required by the flow.
        const btnW = w * 0.5;
        const btnH = h * 0.08;
        const btn = this.add.rectangle(w / 2, h * 0.6, btnW, btnH, 0x36a2eb).setInteractive({ useHandCursor: true });
        this.add.text(w / 2, h * 0.6, 'PLAY', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.06)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        let started = false;
        const start = (): void => {
            if (started) return;
            started = true;
            // `launch` fires here — exactly once, after the player presses Play.
            this.ctx.bridge.signalLaunch();
            this.scene.start('Game', { ctx: this.ctx });
        };

        btn.on('pointerdown', start);
        // Tapping anywhere on the Play Screen also starts the game.
        this.input.on('pointerdown', start);
    }
}
