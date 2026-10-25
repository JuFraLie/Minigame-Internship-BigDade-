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
import { backdrop, makeButton } from '../adapters/phaser/theme.ts';

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

        backdrop(this, w, h);

        // Headline clears the cutout/status-bar inset.
        const headlineY = Math.max(h * 0.3, safeTop + w * 0.16);
        this.add.text(w / 2, headlineY, 'GAME OVER', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.1)}px`,
            fontStyle: 'bold',
            color: '#ff453a',
            stroke: '#ffd23f',
            strokeThickness: Math.max(3, Math.round(w * 0.014)),
        }).setOrigin(0.5);

        this.add.text(w / 2, headlineY + h * 0.075, `Reached wave ${this.wave}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ffd23f',
        }).setOrigin(0.5);

        this.add.text(w / 2, headlineY + h * 0.145, `Score: ${this.score}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.055)}px`,
            color: '#64d2ff',
        }).setOrigin(0.5);

        const btnW = w * 0.5;
        const btnH = Math.max(h * 0.075, 44); // never below the ~44pt touch target
        const btnFont = Math.round(w * 0.05);

        // Retry — straight back to gameplay, the Play Screen must not replay.
        const retryY = headlineY + h * 0.22;
        const retry = makeButton(this, {
            x: w / 2,
            y: retryY,
            width: btnW,
            height: btnH,
            top: 0x30d158,
            bottom: 0x0a9e5b,
            label: 'RETRY',
            fontSize: btnFont,
        });
        retry.image.on('pointerdown', () => {
            this.scene.start('Game', { ctx: this.ctx });
        });

        // Exit — the bridge signal fires exactly once and nothing else happens.
        const exitY = retryY + h * 0.11;
        const exit = makeButton(this, {
            x: w / 2,
            y: exitY,
            width: btnW,
            height: btnH,
            top: 0x5e5ce6,
            bottom: 0xaf52de,
            label: 'EXIT',
            fontSize: btnFont,
        });
        exit.image.on('pointerdown', () => {
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
