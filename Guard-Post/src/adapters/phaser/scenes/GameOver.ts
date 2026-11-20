import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { BACKDROP_KEY, COLORS, ensureTextures, pixelBox, renderBackdrop } from '../textures.ts';
import { computeResultLayout, hitRect, type ResultLayout } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { fitFontSize, uiText } from '../uiStyle.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';

/**
 * The Result Panel — the only screen with Restart, Next Level and Exit.
 *
 * It appears the moment the round ends, shows the level reached and the final score,
 * and offers exactly the buttons for the outcome: Next Level on a victory, Retry on a
 * defeat, plus Exit on both. Retry and Next Level go straight back to gameplay (the
 * Play Screen never replays), and Exit calls the bridge once and does nothing else.
 *
 * Styling is the same flat pixel language as the Play Screen: one panel, one gold
 * primary button, one red exit button, no beveled stone and no outlined text. The
 * panel floats on the same plain olive field as the rest of the game.
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

        renderBackdrop(this, viewport.width, viewport.height, viewport.safeTop);
        if (this.textures.exists(BACKDROP_KEY)) {
            this.add.image(0, 0, BACKDROP_KEY).setOrigin(0, 0).setDepth(-10);
        }

        const panelKey = pixelBox(this, layout.panel.width, layout.panel.height, 'panel');
        this.add.image(Math.round(layout.panel.x), Math.round(layout.panel.y), panelKey).setOrigin(0, 0);

        const title = victory ? 'VICTORY!' : 'DEFEAT';
        const titleSize = fitFontSize(layout.panel.width - 32, title.length, 24, 12);
        uiText(this, layout.width / 2, layout.titleY, title, titleSize, {
            color: victory ? COLORS.goldBright : COLORS.dangerLight,
            shadow: true,
        }).setOrigin(0.5);

        const bodySize = fitFontSize(layout.panel.width - 48, 12, 14, 9);
        uiText(this, layout.width / 2, layout.bodyY, `LEVEL ${flow.level}\nSCORE ${flow.lastScore}`, bodySize, {
            color: COLORS.text,
            lineSpacing: Math.round(bodySize * 0.7),
        }).setOrigin(0.5, 0);

        const primaryLabel = victory ? 'NEXT LEVEL' : 'RETRY';
        const primaryKey = pixelBox(this, layout.primary.width, layout.primary.height, 'primary');
        this.add.image(Math.round(layout.primary.x), Math.round(layout.primary.y), primaryKey).setOrigin(0, 0);
        uiText(
            this,
            layout.primary.x + layout.primary.width / 2,
            layout.primary.y + layout.primary.height / 2,
            primaryLabel,
            fitFontSize(layout.primary.width - 24, primaryLabel.length, 16, 8),
            { color: COLORS.ink },
        ).setOrigin(0.5);

        const exitKey = pixelBox(this, layout.exit.width, layout.exit.height, 'danger');
        this.add.image(Math.round(layout.exit.x), Math.round(layout.exit.y), exitKey).setOrigin(0, 0);
        uiText(
            this,
            layout.exit.x + layout.exit.width / 2,
            layout.exit.y + layout.exit.height / 2,
            'EXIT',
            fitFontSize(layout.exit.width - 24, 4, 16, 8),
            { color: COLORS.white },
        ).setOrigin(0.5);

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
