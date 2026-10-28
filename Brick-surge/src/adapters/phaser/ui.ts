/**
 * How presentation elements are drawn — the one module that paints.
 *
 * Everything goes through plain Canvas 2D: small generated textures for the
 * gradients (painted at backing-store resolution, so they stay sharp on a
 * high-density phone) and plain shapes for the rest. Nothing here may rely
 * on a WebGL-only feature — the game runs in Phaser's CANVAS renderer.
 *
 * What a thing looks like comes from ./theme.ts and where it goes from
 * ./layout.ts; this module only knows how to draw it.
 */

import type Phaser from 'phaser';
import { FONT, THEME } from './theme.ts';
import { renderScale } from './viewport.ts';

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
 * cached under `key` (the texture manager is shared by every scene, so a
 * Retry re-uses the button a previous run already drew). Does nothing when
 * the key already names a texture.
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
    /** Gradient from the theme, top → bottom. */
    gradient: { top: number; bottom: number };
    label: string;
    fontSize: number;
    /** Defaults to the theme's white; warm gradients want the dark label. */
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
    const { x, y, width, height, gradient, label, fontSize } = options;
    const key = `button:${gradient.top.toString(16)}:${gradient.bottom.toString(16)}:${Math.round(width)}x${Math.round(height)}`;
    gradientFill(scene, key, width, height, gradient.top, gradient.bottom);

    const image = scene.add.image(x, y, key)
        .setDisplaySize(width, height)
        .setInteractive({ useHandCursor: true });
    const text = scene.add.text(x, y, label, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: options.labelColor ?? THEME.buttonLabel,
    }).setOrigin(0.5);

    return { image, label: text };
}

export interface IconParts {
    image: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
}

/**
 * A round icon button — the flat counterpart to the gradient makeButton, used
 * for the corner controls (pause, sound). Returned as loose parts so a scene
 * can re-parent them into an overlay, exactly like makeButton.
 */
export function makeIconButton(scene: Phaser.Scene, options: {
    x: number;
    y: number;
    /** Diameter in design units. */
    size: number;
    color: number;
    glyph: string;
    fontSize?: number;
}): IconParts {
    const image = scene.add.circle(options.x, options.y, options.size / 2, options.color)
        .setInteractive({ useHandCursor: true });
    const label = scene.add.text(options.x, options.y, options.glyph, {
        fontFamily: FONT,
        fontSize: `${options.fontSize ?? Math.round(options.size * 0.5)}px`,
        color: THEME.buttonLabel,
    }).setOrigin(0.5);
    return { image, label };
}

/** Speaker glyphs for the sound toggle — emoji read instantly at any size. */
export function soundGlyph(muted: boolean): string {
    return muted ? '🔇' : '🔊';
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
            gradient.addColorStop(0, toCss(THEME.backdropTop));
            gradient.addColorStop(0.45, toCss(THEME.backdropMid));
            gradient.addColorStop(1, toCss(THEME.backdropBottom));
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
