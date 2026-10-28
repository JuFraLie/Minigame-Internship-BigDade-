/**
 * GameOver — the Result Panel (AGENTS.md §2).
 *
 * Shows the final score and how far the endless run got. Restart and Exit live
 * here and nowhere else. Retry goes straight back to gameplay (no Play Screen
 * replay); Exit calls the bridge exit signal exactly once and does nothing else.
 *
 * The scene only wires things together: viewport.ts measures the screen,
 * layout.ts stacks the elements (headline, stats, buttons) inside it,
 * theme.ts provides colours and fonts, ui.ts draws the gradient buttons.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { applyRenderScale, measureViewport, VIEWPORT_CHANGED } from '../adapters/phaser/viewport.ts';
import { resultLayout } from '../adapters/phaser/layout.ts';
import { backdrop, makeButton } from '../adapters/phaser/ui.ts';
import { FONT, THEME } from '../adapters/phaser/theme.ts';

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
        const viewport = measureViewport();
        const { width: w, height: h } = viewport;
        const layout = resultLayout(viewport);

        backdrop(this, w, h);

        this.add.text(w / 2, layout.headlineY, 'GAME OVER', {
            fontFamily: FONT,
            fontSize: `${layout.headlineSize}px`,
            fontStyle: 'bold',
            color: THEME.resultHeadline,
            stroke: THEME.resultHeadlineStroke,
            strokeThickness: Math.max(3, Math.round(w * 0.014)),
        }).setOrigin(0.5);

        this.add.text(w / 2, layout.waveY, `Reached wave ${this.wave}`, {
            fontFamily: FONT,
            fontSize: `${layout.waveSize}px`,
            fontStyle: 'bold',
            color: THEME.resultWave,
        }).setOrigin(0.5);

        this.add.text(w / 2, layout.scoreY, `Score: ${this.score}`, {
            fontFamily: FONT,
            fontSize: `${layout.scoreSize}px`,
            color: THEME.resultScore,
        }).setOrigin(0.5);

        // Retry — straight back to gameplay, the Play Screen must not replay.
        const retry = makeButton(this, {
            x: w / 2,
            y: layout.retryY,
            width: layout.buttonWidth,
            height: layout.buttonHeight,
            gradient: THEME.retry,
            label: 'RETRY',
            fontSize: layout.buttonFontSize,
        });
        retry.image.on('pointerdown', () => {
            this.ctx.sound.play('click');
            this.scene.start('Game', { ctx: this.ctx });
        });

        // Exit — the bridge signal fires exactly once and nothing else happens.
        const exit = makeButton(this, {
            x: w / 2,
            y: layout.exitY,
            width: layout.buttonWidth,
            height: layout.buttonHeight,
            gradient: THEME.exit,
            label: 'EXIT',
            fontSize: layout.buttonFontSize,
        });
        exit.image.on('pointerdown', () => {
            this.ctx.sound.play('click');
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
