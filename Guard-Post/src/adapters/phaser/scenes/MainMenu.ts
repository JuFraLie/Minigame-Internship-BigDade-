import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { COLORS, ensureTextures, hex } from '../textures.ts';
import { computeMenuLayout } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { SCENE_GAME, SCENE_MENU } from './keys.ts';

const FONT = 'Segoe UI, Arial, sans-serif';

/** The two how-to sentences (AGENTS.md §2): the controls are not self-evident. */
const HOW_TO = 'Tap a spot to build a tower.\nStop the enemies before they reach the gate.';

/**
 * The Play Screen: title, Play button, a small tap icon and the how-to text.
 *
 * It shows only on launch — Retry and Next Level go straight back to gameplay — and a
 * tap anywhere on it starts the game, exactly as the host app expects.
 */
export class MainMenu extends Phaser.Scene {
    readonly #deps: AppDeps;
    #started = false;

    readonly #onViewportChanged = (): void => {
        this.scene.restart();
    };

    constructor(deps: AppDeps) {
        super({ key: SCENE_MENU });
        this.#deps = deps;
    }

    create(): void {
        applyRenderScale(this);
        ensureTextures(this);
        this.#started = false;

        const viewport = this.#deps.viewport.current();
        const layout = computeMenuLayout(viewport);

        // The tap icon: a ring with a dot, drawn once.
        const icon = this.add.graphics().setDepth(5);
        icon.lineStyle(4, COLORS.range, 1);
        icon.strokeCircle(layout.icon.x, layout.icon.y, layout.icon.radius);
        icon.fillStyle(COLORS.range, 1);
        icon.fillCircle(layout.icon.x, layout.icon.y, layout.icon.radius * 0.32);

        this.add
            .text(layout.width / 2, layout.titleY, 'Guard Post', {
                fontFamily: FONT,
                fontSize: '46px',
                color: hex(COLORS.text),
                fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(5);

        const play = this.add.image(layout.play.x, layout.play.y, 'ui-button-primary').setOrigin(0, 0).setDepth(5);
        play.setDisplaySize(layout.play.width, layout.play.height);
        this.add
            .text(layout.play.x + layout.play.width / 2, layout.play.y + layout.play.height / 2, 'Play', {
                fontFamily: FONT,
                fontSize: '26px',
                color: hex(COLORS.text),
                fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(6);

        this.add
            .text(layout.width / 2, layout.howToY, HOW_TO, {
                fontFamily: FONT,
                fontSize: '17px',
                color: hex(COLORS.textDim),
                align: 'center',
            })
            .setOrigin(0.5, 0)
            .setDepth(5);

        this.input.on('pointerdown', this.#onPointerDown, this);
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#teardown, this);
    }

    #onPointerDown(): void {
        // A deliberate tap anywhere starts the game; the Play button is the visible cue.
        this.#start();
    }

    #start(): void {
        if (this.#started) return;
        this.#started = true;
        this.#deps.flow.onPlay();
        this.scene.start(SCENE_GAME);
    }

    #teardown(): void {
        this.input.off('pointerdown', this.#onPointerDown, this);
        this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
    }
}
