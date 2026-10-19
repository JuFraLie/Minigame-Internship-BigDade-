import Phaser from 'phaser';
import type { RoundResult } from '../app/roundSession.ts';
import { computeBoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { addText } from './text.ts';
import { THEME } from './theme.ts';
import { createButton, paintRoundedBox } from './widgets.ts';

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
        scene.cameras.main.setBackgroundColor(result.win ? THEME.result.winBg : THEME.result.loseBg);

        const dim = scene.add.graphics();
        dim.fillStyle(THEME.panel.dim, THEME.panel.dimAlphaSoft);
        dim.fillRect(0, 0, width, height);
        this.container.add(dim);

        // Outcome badge: a filled disc with a hand-drawn check or cross, so the verdict
        // lands before a single word is read.
        const iconY = height * 0.115;
        const badge = scene.add.graphics();
        badge.fillStyle(result.win ? THEME.button.primary.fill : THEME.text.dangerNumber, 1);
        badge.fillCircle(cx, iconY, 28);
        badge.lineStyle(5, THEME.text.onFillNumber, 1);
        badge.beginPath();
        if (result.win) {
            badge.moveTo(cx - 11, iconY + 1);
            badge.lineTo(cx - 4, iconY + 9);
            badge.lineTo(cx + 12, iconY - 9);
        } else {
            badge.moveTo(cx - 9, iconY - 9);
            badge.lineTo(cx + 9, iconY + 9);
            badge.moveTo(cx + 9, iconY - 9);
            badge.lineTo(cx - 9, iconY + 9);
        }
        badge.strokePath();
        this.container.add(badge);

        const headlineY = height * 0.2;
        this.container.add(
            addText(scene, cx, headlineY, result.win ? 'LOT CLEARED' : 'OUT OF FENDERS', {
                fontSize: '40px',
                fontStyle: 'bold',
                color: result.win ? THEME.text.primary : THEME.text.danger,
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        // Level pill under the headline.
        const levelLabel = addText(scene, cx, headlineY + 46, `LEVEL ${result.level}`, {
            fontSize: '13px',
            fontStyle: 'bold',
            color: THEME.text.primary,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        const levelChip = scene.add.graphics();
        paintRoundedBox(
            levelChip,
            cx - (levelLabel.width + 28) / 2,
            headlineY + 32,
            levelLabel.width + 28,
            28,
            14,
            THEME.chip.fill,
            THEME.chip.stroke,
            1,
            2,
        );
        this.container.add(levelChip);
        this.container.add(levelLabel);

        // Score card: caption, big accent number, a hairline, then the stats.
        const panelWidth = Math.min(340, width - 56);
        const cardX = cx - panelWidth / 2;
        const cardY = height * 0.35;
        const cardH = 196;
        const card = scene.add.graphics();
        paintRoundedBox(card, cardX, cardY, panelWidth, cardH, 20, THEME.panel.fill, THEME.panel.stroke);
        this.container.add(card);

        this.container.add(
            addText(scene, cx, cardY + 26, 'SCORE', {
                fontSize: '11px',
                fontStyle: 'bold',
                color: THEME.text.muted,
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        this.container.add(
            addText(scene, cx, cardY + 76, String(result.score), {
                fontSize: '50px',
                fontStyle: 'bold',
                color: THEME.text.accent,
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        const divider = scene.add.graphics();
        divider.lineStyle(1, THEME.panel.stroke, 1);
        divider.lineBetween(cardX + 24, cardY + 118, cardX + panelWidth - 24, cardY + 118);
        this.container.add(divider);

        this.container.add(
            addText(
                scene,
                cx,
                cardY + 148,
                `${result.cleared} of ${result.totalCars} cars cleared   •   best combo x${result.maxCombo}`,
                { fontSize: '15px', color: THEME.text.muted, align: 'center', wordWrapWidth: panelWidth - 40 },
            ).setOrigin(0.5, 0.5),
        );

        const primary = result.win
            ? createButton(scene, {
                  x: cx,
                  y: height * 0.73,
                  width: panelWidth - 40,
                  height: 70,
                  label: 'NEXT LEVEL',
                  variant: 'primary',
                  fontSize: '28px',
                  onTap: () => actions.onNextLevel(),
              })
            : createButton(scene, {
                  x: cx,
                  y: height * 0.73,
                  width: panelWidth - 40,
                  height: 70,
                  label: 'RETRY',
                  variant: 'danger',
                  fontSize: '28px',
                  onTap: () => actions.onRetry(),
              });
        this.container.add(primary);

        this.container.add(
            createButton(scene, {
                x: cx,
                y: height * 0.84,
                width: panelWidth - 40,
                height: 60,
                label: 'EXIT',
                variant: 'neutral',
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
