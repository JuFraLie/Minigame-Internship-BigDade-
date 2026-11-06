import Phaser from 'phaser';

import type { AppDeps } from '../app/deps.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../app/viewport.ts';
import { drawBevel } from '../render/Chunky.ts';
import { ensureTextures, shapeTextureKey } from '../render/ShapeTextures.ts';
import { DISPLAY_STACK, PALETTE } from '../render/palette.ts';
import { SCENE_GAME, SCENE_MENU } from './keys.ts';
import { type Arrivable, addLabel, createButton } from './widgets.ts';

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

/** Positions of the floating shapes, as fractions of the viewport. */
const CLUSTER = [
    { shape: 0, dx: -0.27, dy: -0.05, size: 0.155 },
    { shape: 1, dx: 0.0, dy: -0.06, size: 0.135 },
    { shape: 2, dx: 0.27, dy: -0.05, size: 0.165 },
    { shape: 3, dx: -0.19, dy: 0.06, size: 0.14 },
    { shape: 4, dx: 0.19, dy: 0.065, size: 0.15 },
    { shape: 5, dx: 0.0, dy: 0.05, size: 0.135 },
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

        this.add
            .image(0, 0, 'background-wash')
            .setOrigin(0)
            .setDisplaySize(width, height)
            .setDepth(-3);

        // Everything is positioned inside the space left once the status bar and the home
        // indicator are accounted for, so the stack sits where it should on a phone and
        // where it should on a desktop window with neither.
        const top = safeTop + height * 0.02;
        const bottom = height - Math.max(height * 0.035, 14);
        const span = Math.max(1, bottom - top);
        const cx = width / 2;

        const titleCy = top + span * 0.145;
        const clusterCy = top + span * 0.44;
        const playCy = top + span * 0.7;
        const howCy = top + span * 0.88;

        this.#drawTitle(cx, titleCy, width, height);
        this.#drawCluster(cx, clusterCy, width, height);
        this.#drawHowTo(cx, howCy, width);

        const buttonHeight = Math.max(52, Math.round(height * 0.075));
        createButton(this, {
            x: cx,
            y: playCy,
            width: width * 0.66,
            height: buttonHeight,
            label: 'PLAY',
            fill: PALETTE.button,
            labelColour: '#ffffff',
            fontSize: Math.round(buttonHeight * 0.46),
            onPress: () => this.#begin(),
        });

        // Tapping anywhere on the Play Screen starts the game, button or not.
        this.input.on('pointerdown', () => this.#begin());

        // `game.events` outlives the scene, so this must be unbound on shutdown —
        // otherwise a stopped Play Screen would keep restarting itself on every resize.
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
            for (const sprite of this.#bobbers) this.tweens.killTweensOf(sprite as unknown as object);
            this.#bobbers = [];
        });
    }

    /**
     * The title, set on two lines in the display face: two words, two colours, one shadow.
     *
     * Two lines because a single line wide enough to feel like a title would have to shrink
     * until it stopped feeling like one. Both lines are fitted together so the display face
     * can never make one word bigger than the other — a mismatch would read as a mistake.
     */
    #drawTitle(cx: number, cy: number, width: number, height: number): void {
        const size = Math.round(Math.min(width * 0.155, height * 0.095));
        const style = (colour: string): Phaser.Types.GameObjects.Text.TextStyle => ({
            fontFamily: DISPLAY_STACK,
            fontSize: `${size}px`,
            fontStyle: 'bold',
            color: colour,
            stroke: '#15183c',
            strokeThickness: Math.max(4, Math.round(size * 0.13)),
            // One hard offset shadow behind the whole glyph. Blur would soften it into a
            // glow, and a glow is a different game.
            shadow: {
                offsetX: 0,
                offsetY: Math.max(3, Math.round(size * 0.1)),
                color: '#0b0e28',
                blur: 0,
                fill: true,
                stroke: true,
            },
        });

        const first = addLabel(this, cx, cy, 'SHAPEY', style('#ffffff'));
        const second = addLabel(this, cx, cy, 'SUDOKU', style('#ffd76a'));

        const maxWidth = width * 0.86;
        const widest = Math.max(first.width, second.width);
        let fitted = size;
        if (widest > maxWidth) {
            fitted = Math.max(12, Math.floor((size * maxWidth) / widest));
            first.setFontSize(fitted);
            second.setFontSize(fitted);
        }

        // Phaser sizes a line box at `fontSize + strokeThickness`, which is tighter than the
        // glyphs are, so the two lines need explicit air between them.
        const gap = Math.round(fitted * 0.16);
        const total = first.height + gap + second.height;
        const lineTop = cy - total / 2;
        first.y = lineTop + first.height / 2;
        second.y = first.y + first.height / 2 + gap + second.height / 2;

        first.setScale(0.72).setAlpha(0);
        second.setScale(0.72).setAlpha(0);
        this.tweens.add({ targets: [first, second], alpha: 1, duration: 320, delay: 60, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: first, scale: 1, duration: 620, ease: 'Back.easeOut' });
        this.tweens.add({ targets: second, scale: 1, duration: 620, delay: 90, ease: 'Back.easeOut' });
    }

    /** The loose cluster of smiley shapes: staggered entrance, then a permanent drift. */
    #drawCluster(cx: number, cy: number, width: number, height: number): void {
        // Sizes follow the *narrow* axis: a cluster sized off the width alone would fill a
        // landscape window with shapes the size of dinner plates.
        const unit = Math.min(width, height);

        CLUSTER.forEach((item, index) => {
            const sprite = this.add
                .image(cx + item.dx * width, cy + item.dy * height, shapeTextureKey(item.shape))
                .setDisplaySize(item.size * unit, item.size * unit);
            this.#bobbers.push(sprite);

            this.#arrive(sprite, 240 + index * 70, () => this.#float(sprite));
            this.tweens.add({
                targets: sprite,
                angle: (index % 2 === 0 ? -1 : 1) * (7 + Math.random() * 6),
                duration: 2100 + Math.random() * 1100,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        });
    }

    /** The rules, on a slab so the paragraph reads as an object rather than loose text. */
    #drawHowTo(cx: number, cy: number, width: number): void {
        const text = addLabel(this, cx, cy, HOW_TO, {
            // Sized so each of the two sentences holds its own line: a stray word on a
            // third line is the one thing that would make this panel look accidental.
            fontSize: `${Math.max(13, Math.round(width * 0.033))}px`,
            color: '#d8d4ee',
            align: 'center',
            lineSpacing: 7,
            wordWrap: { width: width * 0.86 },
        }).setDepth(2);

        const padX = Math.max(14, width * 0.045);
        const padY = Math.max(10, width * 0.03);
        const panel = this.add.graphics().setDepth(-2);
        drawBevel(panel, cx - text.width / 2 - padX, cy - text.height / 2 - padY, text.width + padX * 2, text.height + padY * 2, 18, {
            fill: PALETTE.hudPill,
            depth: 5,
            drop: 5,
            outline: PALETTE.hudPillEdge,
            outlineWidth: 2,
            gloss: 0.12,
        });

        this.#arrive(text, 620);
        this.#arrive(panel, 620);
    }

    /**
     * Fades a display object in while it rises the last few pixels into place, then hands
     * off to `onDone` — which is how the idle bobbing is kept from fighting the entrance
     * for the same `y`.
     */
    #arrive(target: Arrivable, delay: number, onDone?: () => void): void {
        const homeY = target.y;
        target.setAlpha(0);
        target.y = homeY + 20;

        this.tweens.add({ targets: target, alpha: 1, duration: 320, delay, ease: 'Sine.easeOut' });
        this.tweens.add({
            targets: target,
            y: homeY,
            duration: 560,
            delay,
            ease: 'Back.easeOut',
            onComplete: () => onDone?.(),
        });
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

    /** Guarded, so the button and the tap-anywhere handler cannot both fire a launch. */
    #begin(): void {
        if (this.#starting) return;
        this.#starting = true;
        this.#deps.bridge.launch();
        this.scene.start(SCENE_GAME);
    }
}
