/**
 * Visual effects: floating score numbers, tap ripples and swipe trails.
 *
 * The effects are positioned through the Layout — the only module allowed to know both
 * coordinate spaces — and are purely decorative: the game world runs exactly the same
 * without them.
 */
import Phaser from 'phaser';
import type { FieldPoint } from '../core/config.ts';
import type { FxPort } from '../core/ports.ts';
import { fieldToScreen } from './layout.ts';
import type { Layout } from './layout.ts';
import { addText } from './text.ts';

/** Anything that can fade out over its lifetime. */
interface Fading {
    setAlpha(value: number): unknown;
    destroy(): void;
}

interface TimedSprite {
    object: Fading;
    born: number;
    life: number;
    /** Optional growth animation, used by the expanding rings. */
    grow?: { from: number; to: number; apply(radius: number): void };
}

interface TimedText {
    text: Phaser.GameObjects.Text;
    born: number;
    life: number;
}

const POP_LIFE_MS = 700;
const RING_LIFE_MS = 350;
const TRAIL_LIFE_MS = 220;
const RING_START_RADIUS = 18;
const RING_GROWTH = 2.6;

export class FxSystem implements FxPort {
    readonly #scene: Phaser.Scene;
    readonly #layout: Layout;
    readonly #now: () => number;
    readonly #texts: TimedText[] = [];
    readonly #sprites: TimedSprite[] = [];

    constructor(scene: Phaser.Scene, layout: Layout, now: () => number) {
        this.#scene = scene;
        this.#layout = layout;
        this.#now = now;
    }

    scorePop(at: FieldPoint, value: number, multiplier: number): void {
        const boosted = multiplier > 1;
        const label = boosted ? `+${value} x${multiplier}` : `+${value}`;
        const text = addText(this.#scene, 0, 0, label, {
            fontSize: '30px',
            color: boosted ? '#ffd54a' : '#ffffff',
            stroke: '#1b1226',
            strokeThickness: 7,
        }).setOrigin(0.5, 1);

        const p = fieldToScreen(this.#layout, { x: at.x, y: at.y - 30 });
        text.setPosition(p.x, p.y);
        this.#texts.push({ text, born: this.#now(), life: POP_LIFE_MS });
    }

    tapMark(at: FieldPoint): void {
        this.#ring(at, '#ffffff');
    }

    armorBump(at: FieldPoint): void {
        this.#ring(at, '#8fd8ff');
    }

    swipeTrail(from: FieldPoint, to: FieldPoint): void {
        const a = fieldToScreen(this.#layout, from);
        const b = fieldToScreen(this.#layout, to);
        const bar = this.#scene.add
            .rectangle(
                (a.x + b.x) / 2,
                (a.y + b.y) / 2,
                Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)),
                14,
                0xffffff,
                0.85,
            )
            .setOrigin(0.5)
            .setAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
            .setDepth(70);

        this.#sprites.push({ object: bar, born: this.#now(), life: TRAIL_LIFE_MS });
    }

    #ring(at: FieldPoint, color: string): void {
        const p = fieldToScreen(this.#layout, at);
        const endRadius = RING_START_RADIUS * RING_GROWTH;
        const ring = this.#scene.add
            .circle(p.x, p.y, RING_START_RADIUS)
            .setStrokeStyle(5, Phaser.Display.Color.HexStringToColor(color).color, 0.95)
            .setDepth(70);

        this.#sprites.push({
            object: ring,
            born: this.#now(),
            life: RING_LIFE_MS,
            grow: {
                from: RING_START_RADIUS,
                to: endRadius,
                apply: (radius: number): void => {
                    ring.setRadius(radius);
                },
            },
        });
    }

    /** Ages every effect; finished ones are destroyed. Allocates nothing per frame. */
    update(): void {
        const t = this.#now();

        for (let i = this.#texts.length - 1; i >= 0; i--) {
            const item = this.#texts[i];
            const k = (t - item.born) / item.life;
            if (k >= 1) {
                item.text.destroy();
                this.#texts.splice(i, 1);
                continue;
            }
            item.text.setAlpha(1 - k * k).setY(item.text.y - 0.7);
        }

        for (let i = this.#sprites.length - 1; i >= 0; i--) {
            const item = this.#sprites[i];
            const k = (t - item.born) / item.life;
            if (k >= 1) {
                item.object.destroy();
                this.#sprites.splice(i, 1);
                continue;
            }
            item.grow?.apply(item.grow.from + (item.grow.to - item.grow.from) * k);
            item.object.setAlpha(1 - k);
        }
    }

    /** Drops every effect (scene teardown). */
    clear(): void {
        for (const item of this.#texts) item.text.destroy();
        for (const item of this.#sprites) item.object.destroy();
        this.#texts.length = 0;
        this.#sprites.length = 0;
    }
}
