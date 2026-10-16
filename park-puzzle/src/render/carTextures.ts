import type Phaser from 'phaser';

/**
 * Procedural car and bus textures, generated once and reused.
 *
 * Nothing is downloaded (AGENTS.md §3.4): every car is a rounded rectangle plus a
 * windshield, painted into a canvas texture at a fixed reference size and scaled per
 * board. Generating at a constant size matters — a resize then only changes a scale
 * factor instead of forcing every texture to be rebuilt.
 *
 * Cars are painted HORIZONTAL with the nose at the right edge; the view rotates them.
 */

/** Reference cell size every car texture is painted at. The view scales it to fit. */
export const REFERENCE_CELL = 32;

const cache = new Map<string, Phaser.Textures.CanvasTexture>();

/** Texture key for a car of `length` cells in `color`, horizontal, nose to the right. */
export function carTextureKey(color: number, length: number): string {
    return `car-${color.toString(16)}-${length}`;
}

/**
 * Returns the key of a ready-to-use car texture, painting it on first request.
 *
 * Long vehicles get a hint of a roof rack so a length-3 car reads as bigger than a
 * length-1 car at a glance, which is what the "long cars occupy more ring cells" twist
 * depends on.
 */
export function ensureCarTexture(
    scene: Phaser.Scene,
    color: number,
    length: number,
): string {
    const key = carTextureKey(color, length);
    if (cache.has(key) && scene.textures.exists(key)) return key;

    const width = length * REFERENCE_CELL;
    const height = REFERENCE_CELL;
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) return key;

    const ctx = texture.getContext();
    const pad = 3;
    const radius = 9;

    // Body.
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    roundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, radius);
    ctx.fill();

    // Lower edge shade, so the car has a little weight instead of reading as a flat pill.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    roundRect(ctx, pad, height - pad - 7, width - pad * 2, 7, radius);
    ctx.fill();

    // Windshield and rear window, inset from each end.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    roundRect(ctx, width - pad - 11, pad + 5, 6, height - pad * 2 - 10, 3);
    ctx.fill();
    roundRect(ctx, pad + 5, pad + 5, 5, height - pad * 2 - 10, 3);
    ctx.fill();

    // Roof line down the middle.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(pad + 13, pad + 4, 3, height - pad * 2 - 8);

    texture.refresh();
    cache.set(key, texture);
    return key;
}

/** Drops every cached texture. Only needed if a scene is torn down for good. */
export function clearCarTextures(scene: Phaser.Scene): void {
    for (const key of cache.keys()) {
        if (scene.textures.exists(key)) scene.textures.remove(key);
    }
    cache.clear();
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
