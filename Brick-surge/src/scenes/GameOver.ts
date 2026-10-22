/**
 * GameOver — the Result Panel (AGENTS.md §2).
 *
 * Shows the final score and a win/lose message. Restart and Exit live here and
 * nowhere else. Retry goes straight back to gameplay (no Play Screen replay);
 * Exit calls the bridge exit signal exactly once and does nothing else.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';

export class GameOver extends Phaser.Scene {
    constructor() {
        super('GameOver');
    }

    init(data: { ctx: AppContext; win: boolean; score: number }): void {
        this.ctx = data.ctx;
        this.win = data.win;
        this.score = data.score;
    }

    private ctx!: AppContext;
    private win!: boolean;
    private score!: number;

    create(): void {
        const w = this.scale.width;
        const h = this.scale.height;

        this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);

        this.add.text(w / 2, h * 0.3, this.win ? 'YOU WIN!' : 'GAME OVER', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.1)}px`,
            fontStyle: 'bold',
            color: this.win ? '#4cd964' : '#ff2d55',
        }).setOrigin(0.5);

        this.add.text(w / 2, h * 0.42, `Score: ${this.score}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.055)}px`,
            color: '#ffffff',
        }).setOrigin(0.5);

        const btnW = w * 0.5;
        const btnH = h * 0.075;

        // Retry — straight back to gameplay, the Play Screen must not replay.
        const retry = this.add.rectangle(w / 2, h * 0.56, btnW, btnH, 0x36a2eb)
            .setInteractive({ useHandCursor: true });
        this.add.text(w / 2, h * 0.56, 'RETRY', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);
        retry.on('pointerdown', () => {
            this.scene.start('Game', { ctx: this.ctx });
        });

        // Exit — the bridge signal fires exactly once and nothing else happens.
        const exit = this.add.rectangle(w / 2, h * 0.67, btnW, btnH, 0x48486a)
            .setInteractive({ useHandCursor: true });
        this.add.text(w / 2, h * 0.67, 'EXIT', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);
        exit.on('pointerdown', () => {
            this.ctx.bridge.signalExit(this.win, this.score);
        });
    }
}
