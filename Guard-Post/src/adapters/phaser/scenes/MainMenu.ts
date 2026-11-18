import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { preloadSprites } from '../assets.ts';
import { COLORS, ensureTextures, hex, renderTitlePlaque } from '../textures.ts';
import { computeMenuLayout, hitRect, type MenuLayout } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { SCENE_GAME, SCENE_MENU } from './keys.ts';

const FONT = 'Segoe UI, Arial, sans-serif';
/** A serif for the title only — the one flourish that reads as "fantasy" on any device. */
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

/** The two how-to sentences (AGENTS.md §2): the controls are not self-evident. */
const HOW_TO = 'Tap a spot to build a tower.\nStop the enemies before they reach the gate.';

/**
 * The Play Screen: title, Play button, a small tap icon, the how-to text and the credit.
 *
 * It shows only on launch — Retry and Next Level go straight back to gameplay — and a
 * tap anywhere on it starts the game, exactly as the host app expects. The credit line
 * is the one exception: tapping it opens the credited page and starts nothing.
 */
export class MainMenu extends Phaser.Scene {
    readonly #deps: AppDeps;
    #layout: MenuLayout | null = null;
    #started = false;

    readonly #onViewportChanged = (): void => {
        this.scene.restart();
    };

    constructor(deps: AppDeps) {
        super({ key: SCENE_MENU });
        this.#deps = deps;
    }

    /** The plaque is cut from the pack's stone, so the pack must be local first. */
    preload(): void {
        preloadSprites(this);
    }

    create(): void {
        applyRenderScale(this);
        ensureTextures(this);
        this.#started = false;

        const viewport = this.#deps.viewport.current();
        const layout = computeMenuLayout(viewport);
        this.#layout = layout;

        // The title plaque: the pack's masonry, gold-bevelled, behind the gold title.
        renderTitlePlaque(this, layout.titlePlate.width, layout.titlePlate.height);
        this.add.image(layout.titlePlate.x, layout.titlePlate.y, 'ui-plaque').setOrigin(0, 0).setDepth(4);

        // The tap icon: a ring with a dot, drawn once — gate gold, like the castle.
        const icon = this.add.graphics().setDepth(5);
        icon.lineStyle(4, COLORS.gold, 1);
        icon.strokeCircle(layout.icon.x, layout.icon.y, layout.icon.radius);
        icon.fillStyle(COLORS.gold, 1);
        icon.fillCircle(layout.icon.x, layout.icon.y, layout.icon.radius * 0.32);

        this.add
            .text(layout.width / 2, layout.titleY, 'Guard Post', {
                fontFamily: TITLE_FONT,
                fontSize: '46px',
                color: hex(COLORS.goldBright),
                fontStyle: 'bold',
                stroke: hex(COLORS.ink),
                strokeThickness: 5,
            })
            .setOrigin(0.5)
            .setDepth(5);

        const play = this.add.image(layout.play.x, layout.play.y, 'ui-button-primary').setOrigin(0, 0).setDepth(5);
        play.setDisplaySize(layout.play.width, layout.play.height);
        this.add
            .text(layout.play.x + layout.play.width / 2, layout.play.y + layout.play.height / 2, 'Play', {
                fontFamily: FONT,
                fontSize: '26px',
                color: hex(COLORS.goldBright),
                fontStyle: 'bold',
                stroke: hex(COLORS.ink),
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(6);

        this.add
            .text(layout.width / 2, layout.howToY, HOW_TO, {
                fontFamily: FONT,
                fontSize: '17px',
                color: hex(COLORS.textDim),
                align: 'center',
                stroke: hex(COLORS.ink),
                strokeThickness: 2,
            })
            .setOrigin(0.5, 0)
            .setDepth(5);

        // The credit, underlined so it reads as a link. Tapping it opens skyel's page
        // and deliberately does NOT start the game — see #onPointerDown.
        const credit = this.add
            .text(layout.credit.x + layout.credit.width / 2, layout.credit.y + layout.credit.height / 2, this.#deps.credit.label, {
                fontFamily: FONT,
                fontSize: '16px',
                color: hex(COLORS.textDim),
            })
            .setOrigin(0.5)
            .setDepth(5);
        const underline = this.add.graphics().setDepth(5);
        underline.beginPath();
        underline.lineStyle(1, COLORS.textDim, 0.9);
        underline.moveTo(credit.x - credit.width / 2, credit.y + credit.height / 2 + 3);
        underline.lineTo(credit.x + credit.width / 2, credit.y + credit.height / 2 + 3);
        underline.strokePath();

        this.input.on('pointerdown', this.#onPointerDown, this);
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#teardown, this);
    }

    #onPointerDown(pointer: Phaser.Input.Pointer): void {
        const layout = this.#layout;
        if (layout && hitRect(layout.credit, pointer.worldX, pointer.worldY)) {
            // The credit is the one tap on this screen that does not start the game.
            this.#deps.credit.open();
            return;
        }
        // A deliberate tap anywhere else starts the game; the Play button is the visible cue.
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
        this.#layout = null;
    }
}
