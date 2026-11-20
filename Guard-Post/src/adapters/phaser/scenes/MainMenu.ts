import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { preloadSprites } from '../assets.ts';
import { BACKDROP_KEY, COLORS, ensureCastleIcon, ensureTextures, pixelBox, renderBackdrop } from '../textures.ts';
import { computeMenuLayout, hitRect, type MenuLayout } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { fitFontSize, uiText } from '../uiStyle.ts';
import { SCENE_GAME, SCENE_MENU } from './keys.ts';

/** The two how-to sentences (AGENTS.md §2), wrapped for the pixel font's width. */
const HOW_TO = 'Ketuk titik untuk\nmemasang menara.\nHentikan musuh di gerbang.';

const TITLE = 'GUARD POST';

/**
 * The Play Screen: title, the gate castle, Play button, the how-to text and the credit.
 *
 * It shows only on launch — Retry and Next Level go straight back to gameplay — and a
 * tap anywhere on it starts the game, exactly as the host app expects. The credit line
 * is the one exception: tapping it opens the credited page and starts nothing.
 *
 * The screen uses the same flat pixel boxes as the HUD: one gold plaque, one gold
 * button, no serif and no outlined text. They sit on a plain olive field with
 * one thin sand line, the way a simple mobile menu keeps the focus on the action.
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

    /** The castle icon is cut from the pack, so the pack must be local first. */
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

        // The framed border, dropped below the cutout; the menu is its centrepiece.
        renderBackdrop(this, viewport.width, viewport.height, viewport.safeTop);
        if (this.textures.exists(BACKDROP_KEY)) {
            this.add.image(0, 0, BACKDROP_KEY).setOrigin(0, 0).setDepth(-10);
        }

        // The plaque: a flat dark banner with a gold pixel border behind the title.
        const plaqueKey = pixelBox(this, layout.titlePlate.width, layout.titlePlate.height, 'plaque');
        this.add
            .image(Math.round(layout.titlePlate.x), Math.round(layout.titlePlate.y), plaqueKey)
            .setOrigin(0, 0)
            .setDepth(4);

        // The thing being defended, straight from the pack; a plain gate if it is missing.
        // A tall screen can afford the 3x castle; a short one keeps the 2x icon so the
        // title plaque and the Play button stay clear of it.
        const gapUnderPlaque = layout.play.y - (layout.titlePlate.y + layout.titlePlate.height);
        const castleKey = ensureCastleIcon(this, gapUnderPlaque >= 130 ? 3 : 2);
        if (castleKey) {
            this.add.image(layout.icon.x, layout.icon.y, castleKey).setDepth(5);
        } else {
            const gate = this.add.graphics().setDepth(5);
            gate.fillStyle(COLORS.gold, 1);
            gate.fillRect(layout.icon.x - 30, layout.icon.y - 24, 60, 48);
            gate.fillStyle(COLORS.void, 1);
            gate.fillRect(layout.icon.x - 10, layout.icon.y - 4, 20, 28);
        }

        const titleSize = fitFontSize(layout.titlePlate.width - 24, TITLE.length, 30, 10);
        uiText(this, layout.width / 2, layout.titleY, TITLE, titleSize, {
            color: COLORS.goldBright,
            shadow: true,
        })
            .setOrigin(0.5)
            .setDepth(5);

        const playKey = pixelBox(this, layout.play.width, layout.play.height, 'primary');
        this.add.image(Math.round(layout.play.x), Math.round(layout.play.y), playKey).setOrigin(0, 0).setDepth(5);
        const playSize = fitFontSize(layout.play.width - 24, 'PLAY'.length, 18, 10);
        uiText(this, layout.play.x + layout.play.width / 2, layout.play.y + layout.play.height / 2, 'PLAY', playSize, {
            color: COLORS.ink,
        })
            .setOrigin(0.5)
            .setDepth(6);

        const howToSize = fitFontSize(layout.width - 32, 26, 10, 7);
        uiText(this, layout.width / 2, layout.howToY, HOW_TO, howToSize, {
            // Light text: the how-to sits on the dark field inside the frame.
            color: COLORS.text,
            lineSpacing: Math.round(howToSize * 0.8),
        })
            .setOrigin(0.5, 0)
            .setDepth(5);

        // The credit, underlined so it reads as a link. Tapping it opens skyel's page
        // and deliberately does NOT start the game — see #onPointerDown.
        const creditSize = fitFontSize(layout.credit.width, this.#deps.credit.label.length, 10, 7);
        const credit = uiText(
            this,
            layout.credit.x + layout.credit.width / 2,
            layout.credit.y + layout.credit.height / 2,
            this.#deps.credit.label,
            creditSize,
            { color: COLORS.textDim },
        )
            .setOrigin(0.5)
            .setDepth(5);
        const underline = this.add.graphics().setDepth(5);
        const underlineY = credit.y + creditSize / 2 + 3;
        underline.fillStyle(COLORS.textDim, 0.8);
        underline.fillRect(credit.x - credit.width / 2, underlineY, credit.width, 1);

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
