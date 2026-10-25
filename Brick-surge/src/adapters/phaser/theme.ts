/**
 * Colour theme and the small UI builders the three screens share.
 *
 * Everything paints through plain Canvas 2D — generated textures for the
 * gradients, shapes for the rest — so it all stays inside the CANVAS renderer
 * (no WebGL-only feature ever gets used). One palette runs across the Play
 * Screen, the round and the Result Panel, so the game reads as one colourful
 * whole instead of three unrelated screens.
 *
 * Textures are painted at backing-store resolution (`renderScale`), so a
 * gradient button stays crisp on a high-density phone instead of blurring.
 * They are cached by key in the game-wide texture manager: a Retry re-uses
 * the button a previous run already drew.
 */

import type Phaser from 'phaser';
import { renderScale } from './viewport.ts';

/** Shared palette. Screen-specific one-offs live next to their own code. */
export const THEME = {
    /**
     * Playfield backdrop, top → bottom. style.css paints the same gradient on
     * the page: the canvas is always a full-height column (the portrait
     * playfield keeps the window's height), so page and game meet seamlessly —
     * including the pillarbox beside a landscape window.
     */
    bgTop: 0x2b1b5e,
    bgMid: 0x16204a,
    bgBottom: 0x0b1020,
    /** Tinted band the HUD text sits on, bleeding down from the top edge. */
    hudBand: 0x5e5ce6,
    paddle: 0x64d2ff,
    ball: 0xffffff,
    ballGlow: 0x66d9ff,
    fireball: 0xff6b3d,
    fireballGlow: 0xff9f0a,
    /** The pause button and other violet accents. */
    accent: 0x5e5ce6,
};

/** 0xrrggbb → '#rrggbb' for the Canvas 2D API. */
function toCss(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
}

/** 0xrrggbb → 'rgba(r, g, b, a)' for gradient stops. */
function rgba(color: number, alpha: number): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Rounded-rect path — `ctx.roundRect` is missing from older WebViews. */
function roundedPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

/**
 * A rounded, vertical-gradient fill painted at backing-store resolution and
 * cached under `key`. Returns null only if the key exists but the canvas
 * could not be built — callers then simply use whatever that key names.
 */
function gradientFill(
    scene: Phaser.Scene,
    key: string,
    cssWidth: number,
    cssHeight: number,
    top: number,
    bottom: number,
    radiusCss = 14,
): void {
    if (scene.textures.exists(key)) return;
    const density = renderScale();
    const w = Math.max(1, Math.round(cssWidth * density));
    const h = Math.max(1, Math.round(cssHeight * density));
    const texture = scene.textures.createCanvas(key, w, h);
    if (!texture) return;

    const ctx = texture.getContext();
    const radius = Math.min(radiusCss * density, w / 2, h / 2);
    ctx.clearRect(0, 0, w, h);
    roundedPath(ctx, 0, 0, w, h, radius);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, toCss(top));
    gradient.addColorStop(1, toCss(bottom));
    ctx.fillStyle = gradient;
    ctx.fill();

    texture.refresh();
}

export interface ButtonOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Gradient, top → bottom. */
    top: number;
    bottom: number;
    label: string;
    fontSize: number;
    /** Defaults to white — dark labels sit better on warm gradients. */
    labelColor?: string;
}

export interface ButtonParts {
    image: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
}

/**
 * A gradient button: a cached rounded-rect texture behind a bold label, both
 * interactive. Returned as loose parts so a scene can re-parent them into an
 * overlay container (the pause overlay does exactly that).
 */
export function makeButton(scene: Phaser.Scene, options: ButtonOptions): ButtonParts {
    const { x, y, width, height, top, bottom, label, fontSize } = options;
    const key = `button:${top.toString(16)}:${bottom.toString(16)}:${Math.round(width)}x${Math.round(height)}`;
    gradientFill(scene, key, width, height, top, bottom);

    const image = scene.add.image(x, y, key)
        .setDisplaySize(width, height)
        .setInteractive({ useHandCursor: true });
    const text = scene.add.text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: options.labelColor ?? '#ffffff',
    }).setOrigin(0.5);

    return { image, label: text };
}

const BACKDROP_KEY = 'bricksurge:backdrop';

/**
 * Full-playfield backdrop: one vertical-gradient texture stretched to fit.
 * The page gradient in style.css runs over the same top→bottom range, so the
 * canvas and the page around it blend into a single field of colour.
 */
export function backdrop(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Image {
    if (!scene.textures.exists(BACKDROP_KEY)) {
        const texture = scene.textures.createCanvas(BACKDROP_KEY, 8, 256);
        if (texture) {
            const ctx = texture.getContext();
            const gradient = ctx.createLinearGradient(0, 0, 0, 256);
            gradient.addColorStop(0, toCss(THEME.bgTop));
            gradient.addColorStop(0.45, toCss(THEME.bgMid));
            gradient.addColorStop(1, toCss(THEME.bgBottom));
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 8, 256);
            texture.refresh();
        }
    }
    return scene.add.image(width / 2, height / 2, BACKDROP_KEY).setDisplaySize(width, height);
}

/**
 * The tinted band under the HUD: violet bleeding down to nothing, so the
 * coloured score / wave / ball text sits on colour instead of the bare
 * backdrop. Depth -1: above the backdrop, below every other game object.
 */
export function hudBand(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Image {
    const key = `hudband:${Math.round(width)}x${Math.round(height)}`;
    if (!scene.textures.exists(key)) {
        const density = renderScale();
        const w = Math.max(1, Math.round(width * density));
        const h = Math.max(1, Math.round(height * density));
        const texture = scene.textures.createCanvas(key, w, h);
        if (texture) {
            const ctx = texture.getContext();
            const gradient = ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, rgba(THEME.hudBand, 0.55));
            gradient.addColorStop(0.7, rgba(THEME.hudBand, 0.16));
            gradient.addColorStop(1, rgba(THEME.hudBand, 0));
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
            texture.refresh();
        }
    }
    return scene.add.image(width / 2, height / 2, key)
        .setDisplaySize(width, height)
        .setDepth(-1);
}
