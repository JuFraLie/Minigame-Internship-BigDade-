import type Phaser from 'phaser';
import { HUD_HEIGHT } from './layout.ts';
import { topPadding } from './layout.ts';
import type { Layout } from './layout.ts';
import { addText } from './text.ts';

export interface HudState {
    score: number;
    lives: number;
    maxLives: number;
    combo: number;
}

/**
 * Live score, hearts and combo readout during play (AGENTS.md §2: the HUD always shows the
 * running score). Text is only touched when the underlying value changes.
 */
export class Hud {
    private readonly bar: Phaser.GameObjects.Graphics;
    private readonly hearts: Phaser.GameObjects.Text[] = [];
    private readonly scoreLabel: Phaser.GameObjects.Text;
    private readonly scoreValue: Phaser.GameObjects.Text;
    private readonly comboContainer: Phaser.GameObjects.Container;
    private readonly comboGraphics: Phaser.GameObjects.Graphics;
    private readonly comboText: Phaser.GameObjects.Text;

    private lastScore = -1;
    private lastLives = -1;
    private lastCombo = -1;

    constructor(scene: Phaser.Scene, layout: Layout, maxLives: number) {
        const top = topPadding(layout.viewport);
        const width = layout.viewport.width;

        this.bar = scene.add.graphics().setDepth(10);
        this.bar.fillStyle(0x000000, 0.45);
        this.bar.fillRoundedRect(15, top, width - 30, HUD_HEIGHT, 16);

        for (let i = 0; i < maxLives; i++) {
            const heart = addText(scene, 40 + i * 36, top + HUD_HEIGHT / 2, '', {
                fontSize: '30px',
                color: '#ffffff',
            })
                .setOrigin(0.5, 0.5)
                .setDepth(11);
            this.hearts.push(heart);
        }

        this.scoreLabel = addText(scene, width - 30, top + 30, 'SCORE', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#b0bec5',
        })
            .setOrigin(1, 0.5)
            .setDepth(11);

        this.scoreValue = addText(scene, width - 30, top + 66, '0', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '30px',
            fontStyle: 'bold',
            color: '#ffeb3b',
            stroke: '#000000',
            strokeThickness: 4,
        })
            .setOrigin(1, 0.5)
            .setDepth(11);

        this.comboGraphics = scene.add.graphics();
        this.comboText = addText(scene, 0, 0, '', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5);

        this.comboContainer = scene.add
            .container(width / 2, top + HUD_HEIGHT + 22, [this.comboGraphics, this.comboText])
            .setDepth(11)
            .setVisible(false);
    }

    sync(state: HudState): void {
        if (state.score !== this.lastScore) {
            this.lastScore = state.score;
            this.scoreValue.setText(state.score.toLocaleString('en-US'));
        }

        if (state.lives !== this.lastLives) {
            this.lastLives = state.lives;
            for (let i = 0; i < this.hearts.length; i++) {
                this.hearts[i].setText(i < state.lives ? '❤️' : '🖤');
            }
        }

        if (state.combo !== this.lastCombo) {
            this.lastCombo = state.combo;
            this.renderCombo(state.combo);
        }
    }

    /** Removes everything this HUD owns so it can be laid out again for a new screen size. */
    destroy(): void {
        this.bar.destroy();
        for (const heart of this.hearts) heart.destroy();
        this.scoreLabel.destroy();
        this.scoreValue.destroy();
        // The container owns its graphics and label, so they go with it.
        this.comboContainer.destroy();
    }

    private renderCombo(combo: number): void {
        const visible = combo > 1;
        this.comboContainer.setVisible(visible);
        if (!visible) return;

        this.comboText.setText(`🔥 x${combo}`);
        const width = this.comboText.width + 34;

        this.comboGraphics.clear();
        this.comboGraphics.fillStyle(0xff5722, 1);
        this.comboGraphics.lineStyle(2, 0xffe082, 1);
        this.comboGraphics.fillRoundedRect(-width / 2, -17, width, 34, 17);
        this.comboGraphics.strokeRoundedRect(-width / 2, -17, width, 34, 17);
    }
}
