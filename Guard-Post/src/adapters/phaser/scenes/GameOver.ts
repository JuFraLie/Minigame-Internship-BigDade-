import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { COLORS, ensureTextures, hex, renderBackdrop } from '../textures.ts';
import { computeResultLayout, hitRect, type ResultLayout, type Rect } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';

const FONT = 'Segoe UI, Arial, sans-serif';
/** The same serif as the Play Screen's title — one voice across both screens. */
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

/** Decorative sparks drifting behind the panel — atmosphere, not content. */
const SPARKS = 8;

/**
 * Gold L-brackets and studs on a panel's four corners: the ornament mobile games
 * frame their dialogs with. Drawn at the panel's real rect, so nothing stretches.
 */
function drawCorners(g: Phaser.GameObjects.Graphics, panel: Rect): void {
    const inset = 6;
    const length = 22;
    const x0 = panel.x + inset;
    const y0 = panel.y + inset;
    const x1 = panel.x + panel.width - inset;
    const y1 = panel.y + panel.height - inset;

    g.lineStyle(3, COLORS.gold, 0.95);
    g.beginPath();
    g.moveTo(x0, y0 + length);
    g.lineTo(x0, y0);
    g.lineTo(x0 + length, y0);
    g.moveTo(x1, y0 + length);
    g.lineTo(x1, y0);
    g.lineTo(x1 - length, y0);
    g.moveTo(x0, y1 - length);
    g.lineTo(x0, y1);
    g.lineTo(x0 + length, y1);
    g.moveTo(x1, y1 - length);
    g.lineTo(x1, y1);
    g.lineTo(x1 - length, y1);
    g.strokePath();

    g.fillStyle(COLORS.goldBright, 1);
    for (const [cx, cy] of [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
    ]) {
        g.fillPoints(
            [
                new Phaser.Geom.Point(cx, cy - 5),
                new Phaser.Geom.Point(cx + 5, cy),
                new Phaser.Geom.Point(cx, cy + 5),
                new Phaser.Geom.Point(cx - 5, cy),
            ],
            true,
        );
    }
}

/**
 * The Result Panel — the only screen with Restart, Next Level and Exit.
 *
 * It appears the moment the round ends, shows the level reached and the final score,
 * and offers exactly the buttons for the outcome: Next Level on a victory, Retry on a
 * defeat, plus Exit on both. Retry and Next Level go straight back to gameplay (the
 * Play Screen never replays), and Exit calls the bridge once and does nothing else.
 */
export class GameOver extends Phaser.Scene {
    readonly #deps: AppDeps;
    #layout: ResultLayout | null = null;
    #handled = false;

    readonly #onViewportChanged = (): void => {
        this.scene.restart();
    };

    constructor(deps: AppDeps) {
        super({ key: SCENE_RESULT });
        this.#deps = deps;
    }

    create(): void {
        applyRenderScale(this);
        ensureTextures(this);
        this.#handled = false;

        const flow = this.#deps.flow;
        const victory = flow.outcome === 'victory';
        const viewport = this.#deps.viewport.current();
        const layout = computeResultLayout(viewport);
        this.#layout = layout;

        // The same framed backdrop as the Play Screen — one world across screens.
        renderBackdrop(this, layout.width, viewport.height, Math.max(viewport.safeTop, 24));
        this.add.image(0, 0, 'ui-backdrop').setOrigin(0, 0).setDepth(0);

        for (let i = 0; i < SPARKS; i++) {
            const x = 10 + (((i + 1) * 0.6180339887) % 1) * (layout.width - 20);
            const y = viewport.height * (0.15 + (((i + 1) * 0.3819660113) % 1) * 0.7);
            const size = 6 + (i % 3) * 4;
            const spark = this.add.image(x, y, 'ui-spark').setDepth(1).setAlpha(0).setDisplaySize(size, size);
            this.tweens.add({
                targets: spark,
                alpha: { from: 0, to: 0.5 },
                y: y - 30 - (i % 4) * 8,
                duration: 2800 + (i % 5) * 380,
                delay: i * 210,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        const panel = this.add.image(layout.panel.x, layout.panel.y, 'ui-panel').setOrigin(0, 0).setDepth(1);
        panel.setDisplaySize(layout.panel.width, layout.panel.height);

        // Ornaments at the panel's real rect, so the brackets never stretch.
        const ornament = this.add.graphics().setDepth(2);
        drawCorners(ornament, layout.panel);
        ornament.lineStyle(2, COLORS.gold, 0.6);
        ornament.beginPath();
        ornament.moveTo(layout.width / 2 - 70, layout.panel.y + 84);
        ornament.lineTo(layout.width / 2 + 70, layout.panel.y + 84);
        ornament.strokePath();
        ornament.fillStyle(COLORS.goldBright, 1);
        ornament.fillPoints(
            [
                new Phaser.Geom.Point(layout.width / 2, layout.panel.y + 79),
                new Phaser.Geom.Point(layout.width / 2 + 5, layout.panel.y + 84),
                new Phaser.Geom.Point(layout.width / 2, layout.panel.y + 89),
                new Phaser.Geom.Point(layout.width / 2 - 5, layout.panel.y + 84),
            ],
            true,
        );

        // Two-layer title: ink outline, drop shadow, then the gold face.
        const titleStyle = {
            fontFamily: TITLE_FONT,
            fontSize: '38px',
            fontStyle: 'bold' as const,
            stroke: hex(COLORS.ink),
            strokeThickness: 5,
        };
        this.add
            .text(layout.width / 2, layout.titleY + 3, victory ? 'Victory!' : 'Defeat', {
                ...titleStyle,
                color: victory ? hex(COLORS.goldDark) : hex(0x7a2830),
            })
            .setOrigin(0.5)
            .setDepth(3);
        this.add
            .text(layout.width / 2, layout.titleY, victory ? 'Victory!' : 'Defeat', {
                ...titleStyle,
                color: victory ? hex(COLORS.goldBright) : hex(COLORS.danger),
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(3);

        this.add
            .text(layout.width / 2, layout.bodyY, `Level ${flow.level}\nScore ${flow.lastScore}`, {
                fontFamily: FONT,
                fontSize: '24px',
                color: hex(COLORS.text),
                align: 'center',
                lineSpacing: 14,
                stroke: hex(COLORS.ink),
                strokeThickness: 3,
            })
            .setOrigin(0.5, 0)
            .setDepth(3);

        const primary = this.add.image(layout.primary.x, layout.primary.y, 'ui-button-primary').setOrigin(0, 0).setDepth(3);
        primary.setDisplaySize(layout.primary.width, layout.primary.height);
        const primaryLabel = this.add
            .text(
                layout.primary.x + layout.primary.width / 2,
                layout.primary.y + layout.primary.height / 2,
                victory ? 'Next Level' : 'Retry',
                {
                    fontFamily: FONT,
                    fontSize: '24px',
                    color: hex(COLORS.white),
                    fontStyle: 'bold',
                    stroke: hex(COLORS.ink),
                    strokeThickness: 3,
                },
            )
            .setOrigin(0.5)
            .setDepth(4);
        // The one action that moves forward keeps gently bobbing, like the Play button.
        this.tweens.add({ targets: [primary, primaryLabel], y: '-=5', duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        const exit = this.add.image(layout.exit.x, layout.exit.y, 'ui-button-danger').setOrigin(0, 0).setDepth(3);
        exit.setDisplaySize(layout.exit.width, layout.exit.height);
        this.add
            .text(layout.exit.x + layout.exit.width / 2, layout.exit.y + layout.exit.height / 2, 'Exit', {
                fontFamily: FONT,
                fontSize: '24px',
                color: hex(COLORS.text),
                fontStyle: 'bold',
                stroke: hex(COLORS.ink),
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(4);

        this.input.on('pointerdown', this.#onPointerDown, this);
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#teardown, this);
    }

    #onPointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.#handled) return;
        const layout = this.#layout;
        if (!layout) return;

        const x = pointer.worldX;
        const y = pointer.worldY;

        if (hitRect(layout.primary, x, y)) {
            this.#handled = true;
            const flow = this.#deps.flow;
            if (flow.outcome === 'victory') flow.nextLevel();
            else flow.retry();
            this.scene.start(SCENE_GAME);
            return;
        }

        if (hitRect(layout.exit, x, y)) {
            // The bridge signal, at most once — and nothing else happens on screen.
            this.#deps.flow.exit();
        }
    }

    #teardown(): void {
        this.input.off('pointerdown', this.#onPointerDown, this);
        this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.#layout = null;
    }
}
