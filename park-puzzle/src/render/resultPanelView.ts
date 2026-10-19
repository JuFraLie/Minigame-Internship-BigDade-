import Phaser from 'phaser';
import type { RoundResult } from '../app/roundSession.ts';
import { computeBoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { addText } from './text.ts';
import { createButton, paintRoundedBox } from './widgets.ts';

const WIN_BG = 0x16342a;
const LOSE_BG = 0x3a1d22;

export interface ResultActions {
    /** Win only: the next level. */
    onNextLevel: () => void;
    /** Loss only: the same level again, straight back into gameplay. */
    onRetry: () => void;
    /** Either way: reports the session to the host and does nothing else. */
    onExit: () => void;
}

/**
 * The Result Panel (AGENTS.md §2).
 *
 * It appears only once the round has ended and the score has been finalised and reported,
 * and it is the only screen that offers Next Level, Retry or Exit. Retry goes straight
 * back to gameplay — the Play Screen never replays.
 */
export class ResultPanel {
    private readonly container: Phaser.GameObjects.Container;
    private readonly scene: Phaser.Scene;

    constructor(scene: Phaser.Scene, result: RoundResult, actions: ResultActions) {
        this.scene = scene;
        const layout = computeBoardLayout(measureViewport(), 4, 4);
        const { width, height } = layout.viewport;
        const cx = width / 2;

        this.container = scene.add.container(0, 0).setDepth(100);
        scene.cameras.main.setBackgroundColor(result.win ? WIN_BG : LOSE_BG);

        const dim = scene.add.graphics();
        dim.fillStyle(0x0b0f14, 0.72);
        dim.fillRect(0, 0, width, height);
        this.container.add(dim);

        this.container.add(
            addText(scene, cx, height * 0.2, result.win ? 'LOT CLEARED' : 'OUT OF FENDERS', {
                fontSize: '40px',
                fontStyle: 'bold',
                color: result.win ? '#2ecc71' : '#ff6b6b',
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        this.container.add(
            addText(scene, cx, height * 0.2 + 44, `LEVEL ${result.level}`, {
                fontSize: '20px',
                color: '#9fb0c0',
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        const panelWidth = Math.min(340, width - 56);
        const panel = scene.add.graphics();
        paintRoundedBox(panel, cx - panelWidth / 2, height * 0.36, panelWidth, 210, 20, 0x232d39, 0x3f4d5c);
        this.container.add(panel);

        this.container.add(
            addText(scene, cx, height * 0.42, String(result.score), {
                fontSize: '54px',
                fontStyle: 'bold',
                color: '#ffd166',
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        this.container.add(
            addText(
                scene,
                cx,
                height * 0.52,
                `${result.cleared} of ${result.totalCars} cars cleared   •   best combo x${result.maxCombo}`,
                { fontSize: '17px', color: '#9fb0c0', align: 'center', wordWrapWidth: panelWidth - 24 },
            ).setOrigin(0.5, 0.5),
        );

        const primary = result.win
            ? createButton(scene, {
                  x: cx,
                  y: height * 0.7,
                  width: panelWidth - 40,
                  height: 70,
                  label: 'NEXT LEVEL',
                  fill: 0x2ecc71,
                  stroke: 0x27ae60,
                  fontSize: '28px',
                  onTap: () => actions.onNextLevel(),
              })
            : createButton(scene, {
                  x: cx,
                  y: height * 0.7,
                  width: panelWidth - 40,
                  height: 70,
                  label: 'RETRY',
                  fill: 0xe67e22,
                  stroke: 0xd35400,
                  fontSize: '28px',
                  onTap: () => actions.onRetry(),
              });
        this.container.add(primary);

        this.container.add(
            createButton(scene, {
                x: cx,
                y: height * 0.82,
                width: panelWidth - 40,
                height: 60,
                label: 'EXIT',
                fill: 0x3f4d5c,
                stroke: 0x78828e,
                fontSize: '24px',
                onTap: () => actions.onExit(),
            }),
        );

        this.enter();
    }

    /**
     * Drops the panel in over the colour it is fading onto.
     *
     * It waits out the tail of the scene's fade-in first, so the win/loss colour is
     * already settled when the panel arrives rather than the two fighting for the same
     * third of a second. The whole container moves as one — the dim layer, the readout and
     * both buttons — so the hit areas ride along with what the player can see.
     */
    private enter(): void {
        this.container.setAlpha(0);
        this.container.y = 26;
        this.scene.tweens.add({
            targets: this.container,
            alpha: 1,
            y: 0,
            duration: 240,
            delay: 90,
            ease: 'Back.easeOut',
        });
    }

    dispose(): void {
        this.scene.tweens.killTweensOf(this.container);
        this.container.destroy(true);
    }
}
