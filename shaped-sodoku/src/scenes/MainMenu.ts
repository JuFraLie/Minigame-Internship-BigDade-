import Phaser from 'phaser';

import type { AppDeps } from '../app/deps.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../app/viewport.ts';
import { ensureTextures, shapeTextureKey } from '../render/ShapeTextures.ts';
import { PALETTE } from '../render/palette.ts';
import { SCENE_GAME, SCENE_MENU } from './keys.ts';
import { addLabel, createButton } from './widgets.ts';

/**
 * The Play Screen — the game's mandatory front door.
 *
 * Nothing here is game state. The scene draws a title, a floating cluster of shapes, one
 * how-to line and a Play button, and then starts the round on the very first tap anywhere
 * on the screen. `launch` fires exactly once per session, on that first tap, and Retry
 * never comes back through here.
 */

/** Two short sentences, as the rules allow — and enough to make the controls obvious. */
const HOW_TO = 'Tap a square, then pick the shape that fits.\nEach shape appears once per row, column and box.';
const TITLE = 'Shapey Sudoku';

/** Positions of the floating shapes, as fractions of the viewport. */
const CLUSTER = [
    { shape: 0, dx: -0.27, dy: -0.05, size: 0.17 },
    { shape: 1, dx: -0.13, dy: 0.06, size: 0.15 },
    { shape: 2, dx: 0.02, dy: -0.06, size: 0.19 },
    { shape: 3, dx: 0.17, dy: 0.07, size: 0.15 },
    { shape: 4, dx: 0.3, dy: -0.04, size: 0.16 },
    { shape: 5, dx: -0.05, dy: 0.12, size: 0.14 },
] as const;

export class MainMenu extends Phaser.Scene {
    readonly #deps: AppDeps;
    #starting = false;
    #bobbers: Phaser.GameObjects.Image[] = [];

    readonly #onViewportChanged = (): void => this.#relayout();

    constructor(deps: AppDeps) {
        super({ key: SCENE_MENU });
        this.#deps = deps;
    }

    create(): void {
        this.#starting = false;
        this.#bobbers = [];
        applyRenderScale(this);
        ensureTextures(this);

        const { width, height, safeTop } = this.#deps.viewport.current();

        this.add.image(0, 0, 'background-wash').setOrigin(0).setDisplaySize(width, height);

        addLabel(this, width / 2, safeTop + height * 0.1, TITLE, {
            fontSize: `${Math.round(width * 0.105)}px`,
            fontStyle: 'bold',
            color: '#fdf4e6',
            stroke: '#161a3a',
            strokeThickness: 6,
        });

        const clusterY = height * 0.3;
        for (const item of CLUSTER) {
            const sprite = this.add
                .image(width / 2 + item.dx * width, clusterY + item.dy * height, shapeTextureKey(item.shape, 'normal'))
                .setDisplaySize(item.size * width, item.size * width);
            this.#bobbers.push(sprite);
            this.#float(sprite);
        }

        const buttonHeight = Math.max(52, height * 0.078);
        createButton(this, {
            x: width / 2,
            y: height * 0.55,
            width: width * 0.62,
            height: buttonHeight,
            label: 'PLAY',
            fill: PALETTE.button,
            labelColour: '#1c2148',
            fontSize: Math.round(buttonHeight * 0.44),
            onPress: () => this.#begin(),
        });

        // Routed through `addLabel` so it picks up the game's font stack — Phaser's own
        // default is 'Courier', which would set this paragraph in monospace — and the
        // device-density resolution every other label already gets.
        addLabel(this, width / 2, height * 0.68, HOW_TO, {
            fontSize: `${Math.max(13, Math.round(width * 0.037))}px`,
            color: '#d8d4ee',
            align: 'center',
            lineSpacing: 6,
            wordWrap: { width: width * 0.86 },
        });

        // Tapping anywhere on the Play Screen starts the game, button or not.
        this.input.on('pointerdown', () => this.#begin());

        // `game.events` outlives the scene, so this must be unbound on shutdown —
        // otherwise a stopped Play Screen would keep restarting itself on every resize.
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
            for (const sprite of this.#bobbers) this.tweens.killTweensOf(sprite);
            this.#bobbers = [];
        });
    }

    /**
     * The Play Screen holds no state of its own, so a viewport change is handled by
     * drawing it again from scratch: `create()` already lays everything out against the
     * live viewport, and restarting rebuilds the bobbing tweens at their new home too.
     *
     * Phaser queues a restart rather than running it inline, so this is safe to call from
     * the resize handler. Guarded twice — a transition already in flight must not be
     * cancelled, and a scene that is no longer active must not be brought back.
     */
    #relayout(): void {
        if (this.#starting || !this.scene.isActive()) return;
        this.scene.restart();
    }

    /** Gentle idle bobbing: cheap, and it keeps the Play Screen feeling alive. */
    #float(sprite: Phaser.GameObjects.Image): void {
        this.tweens.add({
            targets: sprite,
            y: sprite.y - (5 + Math.random() * 5),
            duration: 1400 + Math.random() * 700,
            delay: 200 + Math.random() * 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    /** Guarded, so the button and the tap-anywhere handler cannot both fire a launch. */
    #begin(): void {
        if (this.#starting) return;
        this.#starting = true;
        this.#deps.bridge.launch();
        this.scene.start(SCENE_GAME);
    }
}
