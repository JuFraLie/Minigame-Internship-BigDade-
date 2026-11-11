import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { COLORS, ensureTextures, hex } from '../textures.ts';
import { computeResultLayout, hitRect, type ResultLayout } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';

const FONT = 'Segoe UI, Arial, sans-serif';

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

        const panel = this.add.image(layout.panel.x, layout.panel.y, 'ui-panel').setOrigin(0, 0);
        panel.setDisplaySize(layout.panel.width, layout.panel.height);

        this.add
            .text(layout.width / 2, layout.titleY, victory ? 'Victory!' : 'Defeat', {
                fontFamily: FONT,
                fontSize: '38px',
                color: victory ? hex(COLORS.hp) : hex(COLORS.danger),
                fontStyle: 'bold',
            })
            .setOrigin(0.5);

        this.add
            .text(layout.width / 2, layout.bodyY, `Level ${flow.level}\nScore ${flow.lastScore}`, {
                fontFamily: FONT,
                fontSize: '24px',
                color: hex(COLORS.text),
                align: 'center',
                lineSpacing: 14,
            })
            .setOrigin(0.5, 0);

        const primary = this.add.image(layout.primary.x, layout.primary.y, 'ui-button-primary').setOrigin(0, 0);
        primary.setDisplaySize(layout.primary.width, layout.primary.height);
        this.add
            .text(
                layout.primary.x + layout.primary.width / 2,
                layout.primary.y + layout.primary.height / 2,
                victory ? 'Next Level' : 'Retry',
                { fontFamily: FONT, fontSize: '24px', color: hex(COLORS.text), fontStyle: 'bold' },
            )
            .setOrigin(0.5);

        const exit = this.add.image(layout.exit.x, layout.exit.y, 'ui-button-danger').setOrigin(0, 0);
        exit.setDisplaySize(layout.exit.width, layout.exit.height);
        this.add
            .text(layout.exit.x + layout.exit.width / 2, layout.exit.y + layout.exit.height / 2, 'Exit', {
                fontFamily: FONT,
                fontSize: '24px',
                color: hex(COLORS.text),
                fontStyle: 'bold',
            })
            .setOrigin(0.5);

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
