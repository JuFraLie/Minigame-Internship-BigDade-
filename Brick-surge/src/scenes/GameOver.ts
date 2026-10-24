/**
 * GameOver — the Result Panel (AGENTS.md §2).
 *
 * Shows the final score and how far the endless run got. Restart and Exit live
 * here and nowhere else. Retry goes straight back to gameplay (no Play Screen
 * replay); Exit calls the bridge exit signal exactly once and does nothing else.
 *
 * Layout is in design units, fonts scale with width, and thumb-reachable
 * buttons stay at least ~44pt tall.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { applyRenderScale, measureViewport, VIEWPORT_CHANGED } from '../adapters/phaser/viewport.ts';

export class GameOver extends Phaser.Scene {
    constructor() {
        super('GameOver');
    }

    init(data: { ctx: AppContext; wave: number; score: number }): void {
        this.ctx = data.ctx;
        this.wave = data.wave;
        this.score = data.score;
    }

    private ctx!: AppContext;
    private wave!: number;
    private score!: number;

    create(): void {
        applyRenderScale(this);
        const { width: w, height: h, safeTop } = measureViewport();

        this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);

        // Headline clears the cutout/status-bar inset.
        const headlineY = Math.max(h * 0.3, safeTop + w * 0.16);
        this.add.text(w / 2, headlineY, 'GAME OVER', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.1)}px`,
            fontStyle: 'bold',
            color: '#ff2d55',
        }).setOrigin(0.5);

        this.add.text(w / 2, headlineY + h * 0.075, `Reached wave ${this.wave}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            color: '#ffd23f',
        }).setOrigin(0.5);

        this.add.text(w / 2, headlineY + h * 0.145, `Score: ${this.score}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.055)}px`,
            color: '#ffffff',
        }).setOrigin(0.5);

        const btnW = w * 0.5;
        const btnH = Math.max(h * 0.075, 44); // never below the ~44pt touch target

        // Retry — straight back to gameplay, the Play Screen must not replay.
        const retryY = headlineY + h * 0.22;
        const retry = this.add.rectangle(w / 2, retryY, btnW, btnH, 0x36a2eb)
            .setInteractive({ useHandCursor: true });
        this.add.text(w / 2, retryY, 'RETRY', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);
        retry.on('pointerdown', () => {
            this.scene.start('Game', { ctx: this.ctx });
        });

        // Exit — the bridge signal fires exactly once and nothing else happens.
        const exitY = retryY + h * 0.11;
        const exit = this.add.rectangle(w / 2, exitY, btnW, btnH, 0x48486a)
            .setInteractive({ useHandCursor: true });
        this.add.text(w / 2, exitY, 'EXIT', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);
        exit.on('pointerdown', () => {
            // Endless game: the host contract wants `win: true` (jsbridge.ts §exit).
            this.ctx.bridge.signalExit(true, this.score);
        });

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
