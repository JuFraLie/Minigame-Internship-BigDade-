import type Phaser from 'phaser';
import { paintDim, paintGrass } from './backdrop.ts';
import { computeLayout, topPadding } from './layout.ts';
import { addText } from './text.ts';
import { measureViewport } from './viewport.ts';
import { createButton, paintRoundedBox } from './widgets.ts';

/**
 * The numbers the Result Panel shows. Declared here so the drawing layer depends on a
 * contract instead of the app layer: `RoundResult` satisfies it structurally.
 */
export interface ResultStats {
    score: number;
    defeated: number;
    maxCombo: number;
}

/** What the Result Panel can ask for; implemented by the scene that owns the flow. */
export interface ResultActions {
    /** Back to gameplay — the Play Screen never replays. */
    onRetry(): void;
    /** Reports the session to the host; nothing else. */
    onExit(): void;
}

/**
 * Everything the Result Panel draws: backdrop, panel, final score, stats and the two
 * buttons that exist only here.
 *
 * The panel is passive drawing over a score that is already final — `endRound` was
 * reported before it appeared. Flow (`exit`, the scene change) stays in the scene through
 * `ResultActions` (AGENTS.md §2).
 */
export class ResultPanel {
    private readonly scene: Phaser.Scene;
    private readonly stats: ResultStats;
    private readonly actions: ResultActions;

    constructor(scene: Phaser.Scene, stats: ResultStats, actions: ResultActions) {
        this.scene = scene;
        this.stats = stats;
        this.actions = actions;
        this.draw();
    }

    /** Draws the panel again at the current screen size, around the same final score. */
    rebuild(): void {
        this.dispose();
        this.draw();
    }

    /** Destroys only this panel's drawing; the final score is untouched. */
    dispose(): void {
        for (const object of [...this.scene.children.list]) object.destroy();
    }

    /**
     * Draws the Result Panel at the current screen size. Split from the constructor so a
     * viewport change redraws it instead of restarting anything.
     */
    private draw(): void {
        const viewport = measureViewport();
        const layout = computeLayout(viewport);
        const width = viewport.width;
        const height = viewport.height;
        const top = topPadding(layout.viewport);

        const backdrop = this.scene.add.graphics().setDepth(0);
        paintGrass(backdrop, width, height);
        paintDim(backdrop, width, height, 0.7);

        const panelWidth = Math.min(width - 50, 420);
        const panelHeight = 430;
        const centerX = width / 2;
        const centerY = Math.max(top + panelHeight / 2, height * 0.47);
        const left = centerX - panelWidth / 2;
        const panelTop = centerY - panelHeight / 2;

        const panel = this.scene.add.graphics().setDepth(1);
        paintRoundedBox(panel, left, panelTop, panelWidth, panelHeight, 26, 0x1b2a1b, 0x8bc34a);

        addText(this.scene, centerX, panelTop + 52, 'ROUND OVER', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#ffeb3b',
            stroke: '#000000',
            strokeThickness: 7,
        })
            .setOrigin(0.5, 0.5)
            .setDepth(2);

        addText(this.scene, centerX, panelTop + 104, 'FINAL SCORE', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#b0bec5',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(2);

        const finalScore = addText(
            this.scene,
            centerX,
            panelTop + 158,
            this.stats.score.toLocaleString('en-US'),
            {
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '56px',
                fontStyle: 'bold',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 8,
            },
        )
            .setOrigin(0.5, 0.5)
            .setDepth(2);
        // A long score must stay inside the panel on a narrow phone; scale down only.
        finalScore.setScale(Math.min(1, (panelWidth - 40) / Math.max(1, finalScore.width)));

        this.drawStat(centerX - panelWidth / 4, panelTop + 218, 'DEFEATED', this.stats.defeated);
        this.drawStat(centerX + panelWidth / 4, panelTop + 218, 'BEST COMBO', this.stats.maxCombo);

        createButton(this.scene, {
            x: centerX,
            y: panelTop + 300,
            width: panelWidth - 70,
            height: 66,
            label: 'RETRY',
            fill: 0x2e7d32,
            stroke: 0xa5d6a7,
            fontSize: '26px',
            onTap: () => this.actions.onRetry(),
        }).setDepth(2);

        createButton(this.scene, {
            x: centerX,
            y: panelTop + 375,
            width: panelWidth - 70,
            height: 58,
            label: 'EXIT',
            fill: 0xb71c1c,
            stroke: 0xef9a9a,
            fontSize: '22px',
            onTap: () => this.actions.onExit(),
        }).setDepth(2);
    }

    private drawStat(x: number, y: number, label: string, value: number): void {
        addText(this.scene, x, y, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#b0bec5',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(2);

        addText(this.scene, x, y + 32, String(value), {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '30px',
            fontStyle: 'bold',
            color: '#ffd54a',
            stroke: '#000000',
            strokeThickness: 6,
        })
            .setOrigin(0.5, 0.5)
            .setDepth(2);
    }
}
