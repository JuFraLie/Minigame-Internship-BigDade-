import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { preloadSprites } from '../assets.ts';
import { COLORS, PAD_KEY, ensureTextures, hex, renderBackdrop, renderTitlePlaque } from '../textures.ts';
import { HOW_TO_HEIGHT, computeMenuLayout, hitRect, type MenuLayout } from '../layout.ts';
import { applyRenderScale } from '../scale.ts';
import { SCENE_GAME, SCENE_MENU } from './keys.ts';

const FONT = 'Segoe UI, Arial, sans-serif';
/** A serif for the title only — the one flourish that reads as "fantasy" on any device. */
const TITLE_FONT = 'Georgia, "Times New Roman", serif';

/** The two how-to sentences (AGENTS.md §2): the controls are not self-evident. */
const HOW_TO = 'Ketuk titik untuk membangun menara.\nCegah musuh menembus gerbang.';

/** Decorative sparks drifting behind the Play Screen — atmosphere, not content. */
const SPARKS = 14;

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

        // The backdrop: masonry, warm glow, vignette and the gold frame.
        renderBackdrop(this, layout.width, viewport.height, Math.max(viewport.safeTop, 24));
        this.add.image(0, 0, 'ui-backdrop').setOrigin(0, 0).setDepth(0);

        // Drifting gold sparks — the atmosphere a mobile menu lives on. The scatter
        // is a fixed pattern, so every launch looks the same.
        for (let i = 0; i < SPARKS; i++) {
            const x = 10 + (((i + 1) * 0.6180339887) % 1) * (layout.width - 20);
            const y = viewport.height * (0.12 + (((i + 1) * 0.3819660113) % 1) * 0.76);
            const size = 6 + (i % 3) * 4;
            const spark = this.add.image(x, y, 'ui-spark').setDepth(1).setAlpha(0).setDisplaySize(size, size);
            this.tweens.add({
                targets: spark,
                alpha: { from: 0, to: 0.55 },
                y: y - 34 - (i % 4) * 9,
                duration: 2600 + (i % 5) * 420,
                delay: i * 170,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        // The title plaque: the pack's masonry as a banner, behind a two-layer
        // gold title (ink outline + drop shadow, the mobile-logo treatment).
        renderTitlePlaque(this, layout.titlePlate.width, layout.titlePlate.height);
        this.add.image(layout.titlePlate.x, layout.titlePlate.y, 'ui-plaque').setOrigin(0, 0).setDepth(4);

        const titleStyle = {
            fontFamily: TITLE_FONT,
            fontSize: '46px',
            fontStyle: 'bold' as const,
            stroke: hex(COLORS.ink),
            strokeThickness: 6,
        };
        this.add
            .text(layout.width / 2, layout.titleY + 3, 'Guard Post', { ...titleStyle, color: hex(COLORS.goldDark) })
            .setOrigin(0.5)
            .setDepth(5);
        this.add
            .text(layout.width / 2, layout.titleY, 'Guard Post', { ...titleStyle, color: hex(COLORS.goldBright), strokeThickness: 4 })
            .setOrigin(0.5)
            .setDepth(6);

        // The tap cue: a silver build pad with two gold ripples pulsing out of it —
        // literally "tap a spot". Same footprint the layout reserves for the icon.
        const icon = layout.icon;
        this.add.image(icon.x, icon.y, PAD_KEY).setDisplaySize(icon.radius * 1.7, icon.radius * 1.7).setDepth(5);
        for (const delay of [0, 750]) {
            const ring = this.add.graphics().setDepth(5);
            ring.lineStyle(3, COLORS.gold, 1);
            ring.strokeCircle(0, 0, icon.radius + 8);
            ring.setPosition(icon.x, icon.y);
            this.tweens.add({
                targets: ring,
                scale: { from: 0.5, to: 1.3 },
                alpha: { from: 0.9, to: 0 },
                duration: 1500,
                delay,
                repeat: -1,
                ease: 'Sine.easeOut',
            });
        }

        // The one obvious action: gold, bobbing gently so the eye keeps finding it.
        const play = this.add.image(layout.play.x, layout.play.y, 'ui-button-primary').setOrigin(0, 0).setDepth(5);
        play.setDisplaySize(layout.play.width, layout.play.height);
        const playLabel = this.add
            .text(layout.play.x + layout.play.width / 2, layout.play.y + layout.play.height / 2, 'Play', {
                fontFamily: FONT,
                fontSize: '28px',
                color: hex(COLORS.white),
                fontStyle: 'bold',
                stroke: hex(COLORS.ink),
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(6);
        this.tweens.add({ targets: [play, playLabel], y: '-=6', duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        // The how-to sits in an inset bar, so the lower half reads as a composed
        // screen rather than floating text. The bar never grows past the credit.
        const barWidth = Math.min(layout.width * 0.92, 440);
        const bar = this.add.graphics().setDepth(4);
        bar.fillStyle(COLORS.ink, 0.55);
        bar.fillRoundedRect((layout.width - barWidth) / 2, layout.howToY - 8, barWidth, HOW_TO_HEIGHT + 16, 10);
        bar.lineStyle(1, COLORS.gold, 0.35);
        bar.strokeRoundedRect((layout.width - barWidth) / 2, layout.howToY - 8, barWidth, HOW_TO_HEIGHT + 16, 10);

        this.add
            .text(layout.width / 2, layout.howToY, HOW_TO, {
                fontFamily: FONT,
                fontSize: '16px',
                color: hex(COLORS.text),
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
