import Phaser from 'phaser';

import type { EnemyType, TowerType } from '../../domain/types.ts';
import { ALL_FILES, ENEMY_STRIPS, SHOT_IMAGES, TOWER_IMAGES } from './assetManifest.ts';

/**
 * Loads the sprite pack and bakes it into the texture keys the renderer already uses.
 *
 * Two phases, split by the scene lifecycle: `preloadSprites` runs in the Game scene's
 * `preload()` and fetches every file from `public/` under a `raw:` key; the bake runs
 * once from `ensureTextures`-time in the renderer's `create()`, scaling each frame by
 * an integer factor with nearest-neighbour so the pixel art stays crisp, then drops the
 * raw copy. Baking is idempotent — a scene restart sees finished textures and skips
 * straight past both phases.
 *
 * This is the only file that names image files; the paths themselves live in
 * `assetManifest.ts`, which the test suite audits against the disk.
 */

/** Texture key a raw file is loaded under before it is baked. */
export function rawAssetKey(file: string): string {
    return `raw:${file}`;
}

/** The raw image for a manifest file, or null when it is not loaded (yet). */
export function assetImage(scene: Phaser.Scene, file: string): HTMLImageElement | HTMLCanvasElement | null {
    const key = rawAssetKey(file);
    if (!scene.textures.exists(key)) return null;
    const source = scene.textures.get(key).getSourceImage();
    return source instanceof HTMLImageElement || source instanceof HTMLCanvasElement ? source : null;
}

/**
 * Fetches every manifest file, unless its product is already baked.
 *
 * Baked textures replace their raw copy, so the guard checks both: a strip that has
 * been baked must not be fetched again, and a file whose raw copy is still sitting in
 * the texture manager from the current preload must not be fetched twice.
 */
export function preloadSprites(scene: Phaser.Scene): void {
    for (const file of ALL_FILES) {
        const raw = rawAssetKey(file);
        if (scene.textures.exists(raw)) continue;
        const product = bakedProduct(file);
        if (product !== null && scene.textures.exists(product)) continue;
        scene.load.image(raw, encodeURI(file));
    }
}

/** The texture key a file produces once baked; null for files the board paints raw. */
function bakedProduct(file: string): string | null {
    for (const [type, spec] of Object.entries(ENEMY_STRIPS)) {
        if (spec.file === file) return `enemy-${type}-0`;
    }
    for (const [type, spec] of Object.entries(TOWER_IMAGES)) {
        if (spec.file === file) return `tower-${type}-1`;
    }
    for (const [type, spec] of Object.entries(SHOT_IMAGES)) {
        if (spec.file === file) return `shot-${type}`;
    }
    return null;
}

/**
 * Bakes every loaded file into its final texture: enemy frame textures plus their
 * `walk-<type>` animations, tower textures with level pips and shot textures. The
 * field, scenery, gate, the stone the UI cuts its pads from and the Play Screen's
 * castle are read raw instead. Called once per round, after `preloadSprites`.
 */
export function bakeSprites(scene: Phaser.Scene): void {
    bakeEnemyStrips(scene);
    bakeTowers(scene);
    bakeShots(scene);
}

// -- baking helpers ---------------------------------------------------------

/** Draws a source region into a fresh canvas, scaled by an integer factor, crisply. */
function bakeCanvas(
    source: HTMLImageElement | HTMLCanvasElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    scale: number,
): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = sw * scale;
    canvas.height = sh * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function sourceOf(scene: Phaser.Scene, file: string): HTMLImageElement | HTMLCanvasElement | null {
    return assetImage(scene, file);
}

/** Adds a baked canvas as a nearest-neighbour texture, so the Canvas renderer keeps it crisp. */
function addPixelTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
    const texture = scene.textures.addCanvas(key, canvas);
    texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function bakeEnemyStrips(scene: Phaser.Scene): void {
    for (const type of Object.keys(ENEMY_STRIPS) as EnemyType[]) {
        const spec = ENEMY_STRIPS[type];
        const firstKey = `enemy-${type}-0`;
        if (scene.textures.exists(firstKey)) {
            ensureWalkAnimation(scene, type);
            continue;
        }
        const source = sourceOf(scene, spec.file);
        if (!source) continue; // Not loaded — the procedural fallback stands in.

        let complete = true;
        for (let frame = 0; frame < spec.frames; frame++) {
            const canvas = bakeCanvas(source, frame * spec.frameWidth, 0, spec.frameWidth, spec.frameHeight, spec.scale);
            if (!canvas) {
                complete = false;
                break;
            }
            addPixelTexture(scene, `enemy-${type}-${frame}`, canvas);
        }
        if (!complete) continue;
        ensureWalkAnimation(scene, type);
        scene.textures.remove(rawAssetKey(spec.file));
    }
}

function ensureWalkAnimation(scene: Phaser.Scene, type: EnemyType): void {
    const animKey = `walk-${type}`;
    if (scene.anims.exists(animKey)) return;
    const spec = ENEMY_STRIPS[type];
    scene.anims.create({
        key: animKey,
        frames: Array.from({ length: spec.frames }, (_unused, frame) => ({ key: `enemy-${type}-${frame}` })),
        frameRate: spec.fps,
        repeat: -1,
    });
}

function bakeTowers(scene: Phaser.Scene): void {
    for (const type of Object.keys(TOWER_IMAGES) as TowerType[]) {
        const firstKey = `tower-${type}-1`;
        if (scene.textures.exists(firstKey)) continue;
        const spec = TOWER_IMAGES[type];
        const source = sourceOf(scene, spec.file);
        if (!source) continue;

        const base = bakeCanvas(source, 0, 0, source.width, source.height, spec.scale);
        if (!base) continue;

        // Level 1 is the plain tower; levels 2 and 3 add gold pips along the base.
        for (let level = 1; level <= 3; level++) {
            const canvas = document.createElement('canvas');
            canvas.width = base.width;
            canvas.height = base.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) break;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(base, 0, 0);
            if (level > 1) {
                // Pip size follows the canvas, so a bigger bake keeps the proportions.
                ctx.fillStyle = '#f2d98c';
                const pips = level - 1;
                const radius = Math.max(2.5, canvas.width * 0.11);
                const gap = canvas.width * 0.34;
                const baseline = canvas.height - Math.max(4, canvas.width * 0.14);
                for (let pip = 0; pip < pips; pip++) {
                    const cx = canvas.width / 2 + (pip - (pips - 1) / 2) * gap;
                    ctx.beginPath();
                    ctx.arc(cx, baseline, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            addPixelTexture(scene, `tower-${type}-${level}`, canvas);
        }
        scene.textures.remove(rawAssetKey(spec.file));
    }
}

function bakeShots(scene: Phaser.Scene): void {
    for (const type of Object.keys(SHOT_IMAGES) as TowerType[]) {
        const key = `shot-${type}`;
        if (scene.textures.exists(key)) continue;
        const spec = SHOT_IMAGES[type];
        const source = sourceOf(scene, spec.file);
        if (!source) continue;
        const canvas = bakeCanvas(source, 0, 0, source.width, source.height, spec.scale);
        if (!canvas) continue;
        addPixelTexture(scene, key, canvas);
        scene.textures.remove(rawAssetKey(spec.file));
    }
}
