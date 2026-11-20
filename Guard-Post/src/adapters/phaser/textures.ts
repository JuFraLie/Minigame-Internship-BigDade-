import Phaser from 'phaser';

import { GRID_HEIGHT, GRID_WIDTH, distanceToRoad, measureRoad, type GameMap } from '../../domain/maps.ts';
import { TOWER_TYPES, type EnemyType, type TowerType } from '../../domain/types.ts';

/**
 * Textures: everything the game draws with.
 *
 * UI chrome (buttons, panels, capsules) is generated per size with a 2D canvas — no
 * image file and no CDN (AGENTS.md §3.4). The chrome is deliberately flat pixel art:
 * a hard ink border, a solid fill, and a two-pixel light/shade bevel. No gradients,
 * rounded corners or inner outlines, so the UI speaks the same visual language as the
 * sprites instead of looking like a modern overlay. Everything else is drawn here too:
 * enemies (four frames each), towers, shots, the build pads, the gate icon, and the
 * whole board — grass, road, scenery and castle. There is no sprite pack, no image
 * loader and no `.png` file anywhere in this build. Entity textures are authored at a
 * nominal tile of `NOMINAL_TILE` px and scaled by the renderer, so a resize never
 * regenerates anything but the board itself.
 *
 * A plain olive field with a chunky pixel border backs every screen, quiet enough
 * to let the code-drawn field and the sprites be the detail.
 */

export const NOMINAL_TILE = 44;

/**
 * Enemies are drawn in code, not read from PNG strips. Four clean frames per type
 * are baked at startup and cycled by the renderer; this keeps the animation entirely
 * under our control and removes the sprite pack as a source of visual bugs.
 */
export const ENEMY_ANIM: Record<EnemyType, { readonly frames: number; readonly fps: number }> = {
    grunt: { frames: 4, fps: 7 },
    runner: { frames: 4, fps: 8 },
    brute: { frames: 4, fps: 6 },
    boss: { frames: 4, fps: 5 },
};

export const COLORS = {
    /** Deep olive green behind the frame — dark enough to sit under the grass field. */
    background: 0x18271c,
    /** Desert sand: one quiet line around the field, softer than the button gold. */
    sand: 0xc2a15c,
    void: 0x101a2e,
    grass: 0x27503b,
    grassEdge: 0x1f4131,
    /** Flat dirt sampled from the ground tile set (`spr_tile_set_ground.png`). */
    road: 0xbf6f4a,
    /** Silvered build pad: the stone tile set lifted toward silver. */
    padSilver: 0xa7b0c0,
    padEdge: 0xf2f5fa,
    padShade: 0x6d7688,
    /** Gate gold — the accent colour for primary actions and the title. */
    gate: 0xd9b64a,
    gold: 0xd9b64a,
    goldBright: 0xf2d98c,
    white: 0xffffff,
    text: 0xe8eefc,
    textDim: 0x9db1d4,
    danger: 0xe05a5a,
    dart: 0x37c2b8,
    cannon: 0xe07b39,
    frost: 0x7ec8ff,
    grunt: 0xd9534f,
    runner: 0xf0ad4e,
    brute: 0x8e6bbf,
    boss: 0xa02c3f,
    range: 0x8fd0ff,
    /** Selection outline: gold on the silver pad. */
    select: 0xf2d98c,
    hp: 0x68d391,
    hpLost: 0x3a2029,
    /** Ink used for pixel borders and the hard title shadow. */
    ink: 0x0d1524,
} as const;

export function hex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Makes a texture sample with nearest-neighbour. The Canvas renderer reads this from
 * the texture source, so it is the only way to keep generated pixels crisp when the
 * camera zooms for a high-density screen.
 */
function markNearest(scene: Phaser.Scene, key: string): void {
    const texture = scene.textures.get(key);
    if (texture && texture.key !== '__MISSING') texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// ---------------------------------------------------------------------------
// Pixel chrome
// ---------------------------------------------------------------------------

/** Every UI surface variant. One variant = one flat palette, no gradients. */
export type PixelVariant =
    | 'panel'
    | 'plaque'
    | 'capsule'
    | 'button'
    | 'primary'
    | 'danger'
    | 'disabled'
    | 'dart'
    | 'cannon'
    | 'frost';

interface PixelPalette {
    readonly body: number;
    readonly light: number;
    readonly shade: number;
    readonly border: number;
}

/**
 * Colours sampled from the sprite pack: ink for outlines, slate for neutral chrome,
 * gate gold for the forward action, and each tower's own colour for its build button.
 */
const PIXEL: Record<PixelVariant, PixelPalette> = {
    panel: { border: 0x070b14, body: 0x1a2238, light: 0x2f3d5e, shade: 0x111827 },
    plaque: { border: 0xd9b64a, body: 0x18223a, light: 0xf2d98c, shade: 0x8a7426 },
    capsule: { border: 0x070b14, body: 0x1c263e, light: 0x33415f, shade: 0x121a2b },
    button: { border: 0x070b14, body: 0x2b3552, light: 0x47577f, shade: 0x171d2e },
    primary: { border: 0x2a1c08, body: 0xe0a92e, light: 0xffd76a, shade: 0x9c6b12 },
    danger: { border: 0x2a0e0e, body: 0xb0443f, light: 0xe07168, shade: 0x6e2422 },
    disabled: { border: 0x070b14, body: 0x262c3c, light: 0x333b4d, shade: 0x181c28 },
    dart: { border: 0x1b7a74, body: 0x243652, light: 0x7fe8e0, shade: 0x143f4a },
    cannon: { border: 0x8f4a1d, body: 0x3a2b3e, light: 0xffb07a, shade: 0x5a2a14 },
    frost: { border: 0x3f7fa8, body: 0x22324e, light: 0xc4e8ff, shade: 0x254c68 },
};

/**
 * A flat pixel box drawn at its exact final size: a hard 2 px ink border, a solid
 * body, a 2 px light bevel on top/left and a 2 px shade bevel on bottom/right.
 *
 * No rounding, gradient, shadow or inner outline — the same vocabulary as the sprites.
 * Generating one texture per size keeps the 2 px bevel identical on every screen
 * instead of stretching a small texture and blurring its edges.
 */
export function pixelBox(scene: Phaser.Scene, width: number, height: number, variant: PixelVariant): string {
    const w = Math.max(10, Math.round(width));
    const h = Math.max(10, Math.round(height));
    const key = `ui-${variant}-${w}x${h}`;
    if (scene.textures.exists(key)) return key;

    const palette = PIXEL[variant];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'ui-white';

    ctx.fillStyle = hex(palette.border);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(palette.body);
    ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = hex(palette.light);
    ctx.fillRect(2, 2, w - 4, 2);
    ctx.fillRect(2, 2, 2, h - 4);
    ctx.fillStyle = hex(palette.shade);
    ctx.fillRect(2, h - 4, w - 4, 2);
    ctx.fillRect(w - 4, 2, 2, h - 4);

    scene.textures.addCanvas(key, canvas);
    markNearest(scene, key);
    return key;
}

// -- simple backdrop --------------------------------------------------------

/** Texture key for the plain field that sits behind every screen. */
export const BACKDROP_KEY = 'ui-backdrop';

/**
 * A simple mobile-game backdrop: one flat olive field inside a chunky pixel
 * border — a dark block keyline with a sand inner band, all drawn in 4 px steps.
 * No weave, no diamonds, no bevel: the board and buttons still carry the detail.
 *
 * The border starts below `topInset`, clear of status-bar icons and cutouts. The
 * canvas is baked once per screen size and shared by all three scenes.
 */
export function renderBackdrop(scene: Phaser.Scene, width: number, height: number, topInset: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (scene.textures.exists(BACKDROP_KEY)) {
        const source = scene.textures.get(BACKDROP_KEY).source[0];
        if (source && source.width === w && source.height === h) return;
        scene.textures.remove(BACKDROP_KEY);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = hex(COLORS.background);
    ctx.fillRect(0, 0, w, h);

    // Two hard-edged pixel rings. Four fillRects per ring keep the corners square
    // instead of rounded, so the border reads like the rest of the pixel UI.
    const unit = 4;
    const margin = Math.max(unit * 2, Math.round((Math.min(w, h) * 0.035) / unit) * unit);
    const top = Math.max(margin + unit * 2, Math.round(topInset) + unit * 2);
    const frameWidth = Math.max(unit * 4, w - margin * 2);
    const frameHeight = Math.max(unit * 4, h - margin - top);

    const ring = (x: number, y: number, rw: number, rh: number, thickness: number, color: string): void => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, rw, thickness);
        ctx.fillRect(x, y + rh - thickness, rw, thickness);
        ctx.fillRect(x, y + thickness, thickness, rh - thickness * 2);
        ctx.fillRect(x + rw - thickness, y + thickness, thickness, rh - thickness * 2);
    };

    ring(margin, top, frameWidth, frameHeight, unit * 2, hex(COLORS.ink));
    ctx.globalAlpha = 0.8;
    ring(margin + unit * 2, top + unit * 2, frameWidth - unit * 4, frameHeight - unit * 4, unit, hex(COLORS.sand));
    ctx.globalAlpha = 1;

    scene.textures.addCanvas(BACKDROP_KEY, canvas);
    markNearest(scene, BACKDROP_KEY);
}

// ---------------------------------------------------------------------------
// Small shapes
// ---------------------------------------------------------------------------

function polygon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, sides: number, rotation: number): void {
    const points: Phaser.Geom.Point[] = [];
    for (let i = 0; i < sides; i++) {
        const angle = rotation + (i / sides) * Math.PI * 2;
        points.push(new Phaser.Geom.Point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
    }
    g.fillPoints(points, true);
    g.strokePoints(points, true);
}

function ensure(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
    markNearest(scene, key);
}

/** Solid white block, used for the leak flash. */
function ensureWhite(scene: Phaser.Scene): void {
    ensure(scene, 'ui-white', 8, 8, (g) => {
        g.fillStyle(COLORS.white, 1);
        g.fillRect(0, 0, 8, 8);
    });
}

/** Solid ink block, used to darken the field behind the pause overlay. */
function ensureInk(scene: Phaser.Scene): void {
    ensure(scene, 'ui-ink', 8, 8, (g) => {
        g.fillStyle(COLORS.ink, 1);
        g.fillRect(0, 0, 8, 8);
    });
}

// -- code-drawn surfaces -----------------------------------------------------

/** Texture key for a build pad: a silver slab drawn in code. */
export const PAD_KEY = 'ui-pad';

/** Pad edge in texture pixels. */
const PAD_TEXTURE = 40;

/** A silver pavement slab with a simple brick seam, drawn once at its final size. */
export function ensurePadTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PAD_KEY)) return;
    const size = PAD_TEXTURE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = hex(COLORS.padSilver);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = hex(COLORS.padShade);
    for (let row = 0; row < 4; row++) {
        ctx.fillRect(0, row * 10, size, 1);
        const offset = row % 2 === 0 ? 0 : 10;
        for (let x = offset; x < size; x += 20) ctx.fillRect(x, row * 10, 1, 10);
    }

    ctx.strokeStyle = hex(COLORS.ink);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.strokeStyle = hex(COLORS.padEdge);
    ctx.lineWidth = 2;
    ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
    ctx.strokeStyle = hex(COLORS.padShade);
    ctx.lineWidth = 1;
    ctx.strokeRect(4.5, 4.5, size - 9, size - 9);

    scene.textures.addCanvas(PAD_KEY, canvas);
    markNearest(scene, PAD_KEY);
}

/**
 * The gate the player defends, drawn in code for the Play Screen. A small pixel
 * castle with battlements and a dark doorway; the same shape appears on the board.
 */
export function ensureCastleIcon(scene: Phaser.Scene, scale: 2 | 3): string | null {
    const key = `ui-castle-${scale}`;
    if (scene.textures.exists(key)) return key;
    const canvas = document.createElement('canvas');
    canvas.width = 16 * scale;
    canvas.height = 12 * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    const px = (x: number, y: number, w: number, h: number, color: number): void => {
        ctx.fillStyle = hex(color);
        ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
    };

    px(1, 4, 14, 7, COLORS.ink);
    px(2, 5, 12, 5, COLORS.gold);
    px(1, 2, 3, 3, COLORS.ink);
    px(12, 2, 3, 3, COLORS.ink);
    px(2, 3, 1, 1, COLORS.goldBright);
    px(13, 3, 1, 1, COLORS.goldBright);
    px(5, 3, 2, 2, COLORS.gold);
    px(9, 3, 2, 2, COLORS.gold);
    px(6, 7, 4, 4, COLORS.ink);
    px(7, 8, 2, 3, COLORS.void);
    px(0, 11, 16, 1, COLORS.ink);

    scene.textures.addCanvas(key, canvas);
    markNearest(scene, key);
    return key;
}

// -- enemies drawn in code --------------------------------------------------
//
// No sprite strips: every enemy is a handful of hard-edged rectangles baked to four
// frames. Clean silhouettes, a two-step bob and a clear colour per type mean the
// animation comes from this file alone and cannot be broken by a pack asset.

type Pixel = (x: number, y: number, w: number, h: number, color: number) => void;

function enemyTexture(
    scene: Phaser.Scene,
    type: EnemyType,
    frame: number,
    pixels: number,
    scale: number,
    draw: (px: Pixel) => void,
): void {
    const key = `enemy-${type}-${frame}`;
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = pixels * scale;
    canvas.height = pixels * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const px: Pixel = (x, y, w, h, color) => {
        ctx.fillStyle = hex(color);
        ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
    };
    draw(px);
    scene.textures.addCanvas(key, canvas);
    markNearest(scene, key);
}

function ensureEnemies(scene: Phaser.Scene): void {
    for (let frame = 0; frame < ENEMY_ANIM.grunt.frames; frame++) {
        const step = frame % 2;
        enemyTexture(scene, 'grunt', frame, 16, 2, (px) => {
            px(4, 3, 8, 8, COLORS.ink);
            px(5, 4, 6, 6, COLORS.grunt);
            px(5, 4, 6, 2, 0xf28078);
            px(6, 6, 1, 1, COLORS.ink);
            px(9, 6, 1, 1, COLORS.ink);
            px(3, 9, 10, 5, COLORS.ink);
            px(4, 10, 8, 3, COLORS.grunt);
            px(5, 11, 6, 1, 0xf28078);
            px(5 + step, 14, 2, 2, COLORS.ink);
            px(9 - step, 14, 2, 2, COLORS.ink);
        });
    }

    for (let frame = 0; frame < ENEMY_ANIM.runner.frames; frame++) {
        const up = frame % 2 === 1;
        enemyTexture(scene, 'runner', frame, 16, 2, (px) => {
            if (up) {
                px(2, 3, 4, 3, COLORS.ink);
                px(10, 3, 4, 3, COLORS.ink);
                px(3, 4, 3, 1, COLORS.runner);
                px(10, 4, 3, 1, COLORS.runner);
            } else {
                px(1, 6, 5, 3, COLORS.ink);
                px(10, 6, 5, 3, COLORS.ink);
                px(2, 7, 4, 1, COLORS.runner);
                px(10, 7, 4, 1, COLORS.runner);
            }
            px(6, 5, 4, 6, COLORS.ink);
            px(7, 6, 2, 4, COLORS.runner);
            px(7, 7, 1, 1, COLORS.ink);
            px(8, 7, 1, 1, COLORS.ink);
            px(7, 10, 1, 2, COLORS.ink);
            px(8, 10, 1, 2, COLORS.ink);
        });
    }

    for (let frame = 0; frame < ENEMY_ANIM.brute.frames; frame++) {
        const step = frame % 2;
        enemyTexture(scene, 'brute', frame, 18, 2, (px) => {
            px(2, 2, 3, 3, COLORS.ink);
            px(13, 2, 3, 3, COLORS.ink);
            px(3, 3, 1, 1, COLORS.goldBright);
            px(14, 3, 1, 1, COLORS.goldBright);
            px(3, 4, 12, 10, COLORS.ink);
            px(4, 5, 10, 8, COLORS.brute);
            px(4, 5, 10, 2, 0xb79ae0);
            px(6, 8, 2, 2, COLORS.ink);
            px(10, 8, 2, 2, COLORS.ink);
            px(5 + step, 14, 3, 4, COLORS.ink);
            px(10 - step, 14, 3, 4, COLORS.ink);
        });
    }

    for (let frame = 0; frame < ENEMY_ANIM.boss.frames; frame++) {
        const step = frame % 2;
        enemyTexture(scene, 'boss', frame, 20, 2, (px) => {
            px(4, 3, 2, 3, COLORS.ink);
            px(9, 2, 2, 4, COLORS.ink);
            px(14, 3, 2, 3, COLORS.ink);
            px(5, 4, 1, 1, COLORS.goldBright);
            px(10, 3, 1, 1, COLORS.goldBright);
            px(15, 4, 1, 1, COLORS.goldBright);
            px(2, 6, 16, 10, COLORS.ink);
            px(3, 7, 14, 8, COLORS.boss);
            px(3, 7, 14, 2, 0xd45a70);
            px(6, 10, 2, 2, COLORS.ink);
            px(12, 10, 2, 2, COLORS.ink);
            px(5 + step, 16, 3, 4, COLORS.ink);
            px(12 - step, 16, 3, 4, COLORS.ink);
        });
    }
}

function ensureTowers(scene: Phaser.Scene): void {
    const colorOf: Record<TowerType, number> = { dart: COLORS.dart, cannon: COLORS.cannon, frost: COLORS.frost };

    for (const type of TOWER_TYPES) {
        for (let level = 1; level <= 3; level++) {
            ensure(scene, `tower-${type}-${level}`, 36, 36, (g) => {
                const color = colorOf[type];
                // Base plate, shared by every tower.
                g.fillStyle(0x1c2942, 1);
                g.lineStyle(3, 0x0d1524, 1);
                g.fillRoundedRect(2, 6, 32, 28, 8);
                g.strokeRoundedRect(2, 6, 32, 28, 8);
                // The barrel distinguishes the type.
                g.fillStyle(color, 1);
                if (type === 'dart') {
                    g.fillRoundedRect(12, 2, 12, 22, 5);
                    g.fillStyle(0x0d1524, 1);
                    g.fillRect(16, 0, 4, 8);
                } else if (type === 'cannon') {
                    g.fillCircle(18, 16, 10);
                    g.fillStyle(0x0d1524, 1);
                    g.fillRoundedRect(14, 2, 8, 14, 3);
                } else {
                    polygon(g, 18, 14, 11, 4, Math.PI / 4);
                    g.fillStyle(0xffffff, 0.85);
                    g.fillCircle(18, 14, 3);
                }
                // Level pips along the bottom edge.
                g.fillStyle(0xf2d98c, 1);
                for (let pip = 0; pip < level - 1; pip++) {
                    g.fillCircle(13 + pip * 10, 30, 3);
                }
            });
        }
    }
}

function ensureShots(scene: Phaser.Scene): void {
    const colorOf: Record<TowerType, number> = { dart: COLORS.dart, cannon: COLORS.cannon, frost: COLORS.frost };
    for (const type of TOWER_TYPES) {
        const size = type === 'cannon' ? 14 : 10;
        ensure(scene, `shot-${type}`, size, size, (g) => {
            g.fillStyle(colorOf[type], 1);
            g.lineStyle(2, 0x0d1524, 1);
            g.fillCircle(size / 2, size / 2, size / 2 - 1);
            g.strokeCircle(size / 2, size / 2, size / 2 - 1);
        });
    }
}

// -- texture entry points ---------------------------------------------------

/** Generates the two flat textures the UI cannot size itself. Idempotent. */
export function ensureTextures(scene: Phaser.Scene): void {
    ensureWhite(scene);
    ensureInk(scene);
}

/**
 * Generates every entity texture in code. Nothing is loaded from disk. Runs from the
 * renderer's `create()`, before the first frame is presented.
 */
export function ensureEntityTextures(scene: Phaser.Scene): void {
    ensureEnemies(scene);
    ensureTowers(scene);
    ensureShots(scene);
    ensurePadTexture(scene);
}

// ---------------------------------------------------------------------------
// The board — the one texture that depends on the layout
// ---------------------------------------------------------------------------

export const BOARD_KEY = 'board';

type Ctx = CanvasRenderingContext2D;

/** One flat palette per map theme: grass, its lighter patch, road and gate. */
const BOARD_THEMES = [
    { grass: 0x2f7a4f, patch: 0x37875a, edge: 0x1d4d33, road: 0xc07a4f, gate: 0x6f8fd6 },
    { grass: 0x1e6e50, patch: 0x27835d, edge: 0x154a35, road: 0xb96f47, gate: 0x5ba36a },
    { grass: 0x6b6a3a, patch: 0x797742, edge: 0x454427, road: 0xcf7b4a, gate: 0xc06545 },
] as const;

function themeOf(map: GameMap): (typeof BOARD_THEMES)[number] {
    return BOARD_THEMES[map.theme % BOARD_THEMES.length] ?? BOARD_THEMES[0];
}

/**
 * Paints grass, road, scenery and the gate into a canvas texture sized for `tile`.
 * Regenerated when the layout changes; everything else is drawn once. The build pads
 * are not part of this: the renderer draws them per frame, so a pad can disappear the
 * moment a tower stands on it.
 */
export function renderBoardTexture(scene: Phaser.Scene, map: GameMap, tile: number): void {
    const width = Math.ceil(tile * GRID_WIDTH);
    const height = Math.ceil(tile * GRID_HEIGHT);

    if (scene.textures.exists(BOARD_KEY)) scene.textures.remove(BOARD_KEY);
    const texture = scene.textures.createCanvas(BOARD_KEY, width, height);
    if (!texture) return;
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const ctx = texture.context;
    ctx.imageSmoothingEnabled = false;

    paintField(ctx, map, width, height, tile);
    paintRoad(ctx, map, tile);
    paintScenery(ctx, map, tile, width, height);
    paintGate(ctx, map, tile);

    texture.refresh();
}

/**
 * The grass field: a flat themed fill with a faint block patch in alternating cells,
 * so the ground has pixel texture without needing a tile set. The rim separates it
 * from the void.
 */
function paintField(ctx: Ctx, map: GameMap, width: number, height: number, tile: number): void {
    const theme = themeOf(map);
    ctx.fillStyle = hex(theme.grass);
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = hex(theme.patch);
    for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        for (let gx = 0; gx < GRID_WIDTH; gx++) {
            if ((gx + gy) % 2 === 0) ctx.fillRect(gx * tile + 2, gy * tile + 2, tile - 4, tile - 4);
        }
    }

    ctx.strokeStyle = hex(theme.edge);
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.strokeRect(0, 0, width, height);
}

/**
 * The road: every cell the centreline touches is filled with the theme's dirt colour,
 * then a dark band with pixel bumps is drawn on each grass-facing side. The band is
 * code, not a tile set, so the rim stays crisp at any board scale.
 */
function paintRoad(ctx: Ctx, map: GameMap, tile: number): void {
    const road = measureRoad(map);
    const isRoad = (gx: number, gy: number): boolean =>
        gx < 0 ||
        gy < 0 ||
        gx >= GRID_WIDTH ||
        gy >= GRID_HEIGHT ||
        distanceToRoad(map, road, { x: gx + 0.5, y: gy + 0.5 }) <= 0.5 + 1e-9;

    const theme = themeOf(map);
    ctx.fillStyle = hex(theme.road);
    for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        for (let gx = 0; gx < GRID_WIDTH; gx++) {
            if (isRoad(gx, gy)) ctx.fillRect(gx * tile, gy * tile, tile, tile);
        }
    }

    const rim = Math.max(2, Math.round(tile * 0.09));
    const bump = Math.max(2, Math.round(tile * 0.18));
    ctx.fillStyle = hex(theme.edge);
    for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        for (let gx = 0; gx < GRID_WIDTH; gx++) {
            if (!isRoad(gx, gy)) continue;
            const x = gx * tile;
            const y = gy * tile;
            if (!isRoad(gx, gy - 1)) {
                ctx.fillRect(x, y, tile, rim);
                for (let bx = 0; bx < tile; bx += bump * 2) ctx.fillRect(x + bx, y + rim, bump, bump);
            }
            if (!isRoad(gx, gy + 1)) {
                ctx.fillRect(x, y + tile - rim, tile, rim);
                for (let bx = 0; bx < tile; bx += bump * 2) ctx.fillRect(x + bx, y + tile - rim - bump, bump, bump);
            }
            if (!isRoad(gx - 1, gy)) ctx.fillRect(x, y, rim, tile);
            if (!isRoad(gx + 1, gy)) ctx.fillRect(x + tile - rim, y, rim, tile);
        }
    }
}

/**
 * Trees, rocks and mushrooms, drawn as blocky shapes and scattered by a hash of the
 * cell and map name — the same scenery every round, a different set on every layout.
 */
function paintScenery(ctx: Ctx, map: GameMap, tile: number, width: number, height: number): void {
    const road = measureRoad(map);
    const gate = map.waypoints[map.waypoints.length - 1];
    const theme = themeOf(map);
    let seed = 17;
    for (const char of map.name) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;

    for (let cy = 0; cy < GRID_HEIGHT; cy++) {
        for (let cx = 0; cx < GRID_WIDTH; cx++) {
            const center = { x: cx + 0.5, y: cy + 0.5 };
            if (distanceToRoad(map, road, center) < 1.35) continue;
            if (map.spots.some((spot) => Math.hypot(spot.x - center.x, spot.y - center.y) < 1.45)) continue;
            if (Math.hypot(gate.x - center.x, gate.y - center.y) < 2.3) continue;

            const hash = ((cx * 73856093) ^ (cy * 19349663) ^ seed) >>> 0;
            const roll = hash % 100;
            const kind = roll < 9 ? 'tree' : roll < 15 ? 'rock' : roll < 19 ? 'mushroom' : null;
            if (!kind) continue;

            const x = cx * tile + tile / 2;
            const y = (cy + 1) * tile - tile * 0.12;
            if (kind === 'tree') {
                const trunk = Math.max(2, Math.round(tile * 0.16));
                const crown = Math.round(tile * 0.8);
                ctx.fillStyle = '#6b4a2b';
                ctx.fillRect(Math.round(x - trunk / 2), Math.round(y - crown * 0.45), trunk, Math.round(crown * 0.45));
                ctx.fillStyle = hex(theme.edge);
                ctx.fillRect(Math.round(x - crown / 2), Math.round(y - crown), crown, Math.round(crown * 0.65));
                ctx.fillStyle = hex(theme.patch);
                ctx.fillRect(Math.round(x - crown / 3), Math.round(y - crown * 0.95), Math.round(crown * 0.66), Math.round(crown * 0.4));
            } else if (kind === 'rock') {
                const size = Math.round(tile * 0.45);
                ctx.fillStyle = '#6d7280';
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size), size, size);
                ctx.fillStyle = '#9aa3b4';
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size), size, Math.round(size / 3));
            } else {
                const size = Math.round(tile * 0.3);
                ctx.fillStyle = '#e8eefc';
                ctx.fillRect(Math.round(x - size / 5), Math.round(y - size), Math.round(size * 0.4), size);
                ctx.fillStyle = '#d9534f';
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size * 1.2), size, Math.round(size * 0.5));
            }
        }
    }

    // Shapes are bottom-anchored in their own cell; keep the bounds explicit for readers.
    void width;
    void height;
}

/**
 * The gate the player defends: a code-drawn castle, three tiles wide and themed
 * blue / green / red, with battlements and a dark doorway. No castle art is loaded.
 */
function paintGate(ctx: Ctx, map: GameMap, tile: number): void {
    const gate = map.waypoints[map.waypoints.length - 1];
    const gx = gate.x * tile;
    const gy = gate.y * tile;
    const theme = themeOf(map);

    const w = tile * 3;
    const h = Math.round(tile * 2);
    const x = Math.round(gx - w / 2);
    const y = Math.round(gy + tile * 0.32 - h);

    ctx.fillStyle = hex(COLORS.ink);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hex(theme.gate);
    ctx.fillRect(x + Math.round(tile * 0.2), y + Math.round(tile * 0.42), w - Math.round(tile * 0.4), h - Math.round(tile * 0.42));

    const merlon = Math.max(3, Math.round(tile * 0.35));
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = hex(theme.gate);
        ctx.fillRect(x + Math.round((i * w) / 5), y + Math.round(tile * 0.12), merlon, Math.round(tile * 0.42));
        ctx.fillStyle = hex(COLORS.goldBright);
        ctx.fillRect(x + Math.round((i * w) / 5), y + Math.round(tile * 0.12), merlon, Math.max(2, Math.round(tile * 0.1)));
    }

    ctx.fillStyle = hex(COLORS.ink);
    ctx.fillRect(x + Math.round(w * 0.38), y + Math.round(h * 0.55), Math.round(w * 0.24), Math.round(h * 0.45));
    ctx.fillStyle = hex(COLORS.void);
    ctx.fillRect(x + Math.round(w * 0.43), y + Math.round(h * 0.62), Math.round(w * 0.14), Math.round(h * 0.38));
}
