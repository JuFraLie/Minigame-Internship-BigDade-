import Phaser from 'phaser';

import { GRID_HEIGHT, GRID_WIDTH, distanceToRoad, measureRoad, type GameMap } from '../../domain/maps.ts';
import { TOWER_TYPES, type EnemyType, type TowerType } from '../../domain/types.ts';
import { PALETTE, UI_PALETTE, type PixelPalette, type PixelVariant as PaletteVariant } from './palette.ts';

export type PixelVariant = PaletteVariant;

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
 * A deep grass-green field with a sandy pixel border backs every screen. The whole
 * look — board, chrome, text and accents — comes from the shared palette in
 * `palette.ts`, so the game reads as one grassy, sandy place.
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
    /** Deep grass green behind the frame — dark enough to sit under the board. */
    background: PALETTE.deep,
    /** Sand: one quiet line around the field and the band of the board frame. */
    sand: PALETTE.sand,
    void: PALETTE.void,
    grass: PALETTE.grass,
    grassEdge: PALETTE.grassDark,
    /** Sandy path cutting through the grass. */
    road: PALETTE.sand,
    /** Sandstone build pad, edged with the lightest sand. */
    padSilver: PALETTE.sand,
    padEdge: PALETTE.sandLight,
    padShade: PALETTE.sandShade,
    /** Gate gold — the accent colour for primary actions and the title. */
    gate: PALETTE.sand,
    gold: PALETTE.sand,
    goldBright: PALETTE.sandLight,
    white: PALETTE.flash,
    text: PALETTE.cream,
    textDim: PALETTE.sage,
    danger: PALETTE.clay,
    dangerLight: PALETTE.clayLight,
    // Towers and their build buttons keep the earlier, easier-to-read triplet.
    dart: PALETTE.dartLabel,
    cannon: PALETTE.cannonLabel,
    frost: PALETTE.frostLabel,
    buildDim: PALETTE.legacyDim,
    grunt: PALETTE.clay,
    runner: PALETTE.ochre,
    brute: PALETTE.plum,
    boss: PALETTE.berry,
    range: PALETTE.sandLight,
    /** Selection outline: light sand on the sandstone pad. */
    select: PALETTE.sandLight,
    hp: PALETTE.moss,
    hpLost: PALETTE.void,
    /** Ink used for pixel borders and the hard title shadow. */
    ink: PALETTE.ink,
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

/**
 * The shared grass-and-sand surfaces. Definition lives in `palette.ts`; this alias
 * keeps the drawing code close to the variant it is painting.
 */
const PIXEL: Record<PixelVariant, PixelPalette> = UI_PALETTE;

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

/** Framed backdrop for the Play Screen and Result Panel. */
export const BACKDROP_KEY = 'ui-backdrop';
/** Grass-green-only backdrop for gameplay: the board carries its own front frame there. */
export const BACKDROP_PLAIN_KEY = 'ui-backdrop-plain';

/**
 * A flat deep-grass field. Menus and the Result Panel get the chunky pixel ring — an
 * ink keyline with a sand inner band — while gameplay stays unframed so the board's own
 * front frame is the only border on screen. The ring starts below `topInset`, clear
 * of status-bar icons and cutouts. Each key is baked once per screen size.
 */
export function renderBackdrop(
    scene: Phaser.Scene,
    width: number,
    height: number,
    topInset: number,
    framed = true,
): string {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = framed ? BACKDROP_KEY : BACKDROP_PLAIN_KEY;
    if (scene.textures.exists(key)) {
        const source = scene.textures.get(key).source[0];
        if (source && source.width === w && source.height === h) return key;
        scene.textures.remove(key);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return key;

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

    if (framed) {
        ring(margin, top, frameWidth, frameHeight, unit * 2, hex(COLORS.ink));
        ctx.globalAlpha = 0.8;
        ring(margin + unit * 2, top + unit * 2, frameWidth - unit * 4, frameHeight - unit * 4, unit, hex(COLORS.sand));
        ctx.globalAlpha = 1;
    }

    scene.textures.addCanvas(key, canvas);
    markNearest(scene, key);
    return key;
}

/** Texture key for the sandy frame drawn in front of the game board. */
export const BOARD_FRAME_KEY = 'ui-board-frame';
/** Border thickness around the board, in design pixels. */
export const BOARD_FRAME_THICKNESS = 12;

/**
 * A transparent texture containing only the board frame: a 4 px ink keyline outside
 * an 8 px sand band. The centre is deliberately empty, so it can sit in front of the
 * map and its sprites without covering gameplay. Sized to the board, not the screen,
 * so the frame and the map always share the same height.
 */
export function renderBoardFrame(scene: Phaser.Scene, boardWidth: number, boardHeight: number): void {
    const boardW = Math.max(1, Math.round(boardWidth));
    const boardH = Math.max(1, Math.round(boardHeight));
    const w = boardW + BOARD_FRAME_THICKNESS * 2;
    const h = boardH + BOARD_FRAME_THICKNESS * 2;

    if (scene.textures.exists(BOARD_FRAME_KEY)) {
        const source = scene.textures.get(BOARD_FRAME_KEY).source[0];
        if (source && source.width === w && source.height === h) return;
        scene.textures.remove(BOARD_FRAME_KEY);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ring = (x: number, y: number, rw: number, rh: number, thickness: number, color: string): void => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, rw, thickness);
        ctx.fillRect(x, y + rh - thickness, rw, thickness);
        ctx.fillRect(x, y + thickness, thickness, rh - thickness * 2);
        ctx.fillRect(x + rw - thickness, y + thickness, thickness, rh - thickness * 2);
    };

    ring(0, 0, w, h, 4, hex(COLORS.ink));
    ring(4, 4, w - 8, h - 8, 8, hex(COLORS.sand));
    ring(BOARD_FRAME_THICKNESS - 2, BOARD_FRAME_THICKNESS - 2, boardW + 4, boardH + 4, 2, hex(COLORS.ink));

    scene.textures.addCanvas(BOARD_FRAME_KEY, canvas);
    markNearest(scene, BOARD_FRAME_KEY);
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

/** Texture key for a build pad: a sandstone slab drawn in code. */
export const PAD_KEY = 'ui-pad';

/** Pad edge in texture pixels. */
const PAD_TEXTURE = 40;

/** A sandstone pavement slab with a simple brick seam, drawn once at its final size. */
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

/** Logical canvas the gate is authored on, so the icon and board share one drawing. */
const GATE_ART_WIDTH = 48;
const GATE_ART_HEIGHT = 36;

/**
 * The gate the player defends: two flanking towers, a crenellated keep, a sand-gold
 * pennant and an arched doorway. Every coordinate is in the 48 x 36 art space above and mapped
 * to integer device pixels, so the shape stays crisp at any board tile size.
 */
function drawGateShape(
    ctx: Ctx,
    x: number,
    y: number,
    w: number,
    h: number,
    gate: number,
    shade: number,
    light: number,
): void {
    const sx = w / GATE_ART_WIDTH;
    const sy = h / GATE_ART_HEIGHT;
    const px = (gx: number, gy: number, gw: number, gh: number, color: number): void => {
        ctx.fillStyle = hex(color);
        ctx.fillRect(
            x + Math.round(gx * sx),
            y + Math.round(gy * sy),
            Math.max(1, Math.round(gw * sx)),
            Math.max(1, Math.round(gh * sy)),
        );
    };

    // Stone plinth the castle stands on.
    px(0, 32, 48, 4, COLORS.ink);
    px(2, 30, 44, 3, shade);

    // Left tower: dark outline, themed face, light cap and two merlons.
    px(2, 8, 11, 24, COLORS.ink);
    px(4, 10, 7, 22, gate);
    px(4, 10, 7, 2, light);
    px(1, 4, 4, 5, COLORS.ink);
    px(3, 5, 2, 3, gate);
    px(7, 4, 4, 5, COLORS.ink);
    px(8, 5, 2, 3, gate);

    // Right tower, mirrored.
    px(35, 8, 11, 24, COLORS.ink);
    px(37, 10, 7, 22, gate);
    px(37, 10, 7, 2, light);
    px(36, 4, 4, 5, COLORS.ink);
    px(38, 5, 2, 3, gate);
    px(43, 4, 4, 5, COLORS.ink);
    px(43, 5, 2, 3, gate);

    // Central keep between the towers, with three merlons.
    px(11, 12, 26, 20, COLORS.ink);
    px(13, 14, 22, 18, gate);
    px(13, 14, 22, 2, light);
    for (const mx of [13, 22, 31]) {
        px(mx, 10, 4, 4, COLORS.ink);
        px(mx + 1, 11, 2, 3, gate);
    }

    // Brick seams, kept clear of the doorway.
    px(4, 16, 7, 1, shade);
    px(4, 22, 6, 1, shade);
    px(13, 19, 6, 1, shade);
    px(29, 19, 6, 1, shade);
    px(13, 25, 5, 1, shade);
    px(30, 25, 5, 1, shade);
    px(37, 16, 7, 1, shade);
    px(37, 22, 7, 1, shade);

    // Pennant on the keep.
    px(23, 2, 1, 9, COLORS.ink);
    px(24, 3, 6, 3, COLORS.gold);
    px(24, 6, 4, 1, COLORS.goldBright);

    // Stepped arch and its dark opening.
    px(19, 22, 10, 10, COLORS.ink);
    px(20, 20, 8, 2, COLORS.ink);
    px(21, 18, 6, 2, COLORS.ink);
    px(22, 17, 4, 1, COLORS.ink);
    px(21, 24, 6, 8, COLORS.void);
    px(22, 22, 4, 2, COLORS.void);
    px(23, 20, 2, 2, COLORS.void);
}

/**
 * Play Screen castle: the same gate as the board, baked once at an integer scale.
 */
export function ensureCastleIcon(scene: Phaser.Scene, scale: 2 | 3): string | null {
    const key = `ui-castle-${scale}`;
    if (scene.textures.exists(key)) return key;
    const canvas = document.createElement('canvas');
    canvas.width = GATE_ART_WIDTH * scale;
    canvas.height = GATE_ART_HEIGHT * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    const theme = BOARD_THEMES[0];
    drawGateShape(ctx, 0, 0, canvas.width, canvas.height, theme.gate, theme.gateShade, theme.gateLight);

    scene.textures.addCanvas(key, canvas);
    markNearest(scene, key);
    return key;
}

// -- enemies drawn in code --------------------------------------------------
//
// No sprite strips and no legs: every enemy is a hovering or flying silhouette built
// from hard-edged rectangles and baked to four frames. A two-step bob (and wing flap
// for the runner) supplies the motion, so the animation comes from this file alone
// and cannot be broken by a pack asset.

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
    // Grunt — a hovering blob with a wavy tail instead of feet.
    for (let frame = 0; frame < ENEMY_ANIM.grunt.frames; frame++) {
        const lift = frame % 2;
        const tail = frame % 4 === 1 ? 1 : 0;
        enemyTexture(scene, 'grunt', frame, 16, 2, (px) => {
            px(4, 3 + lift, 8, 7, COLORS.ink);
            px(5, 4 + lift, 6, 5, COLORS.grunt);
            px(5, 4 + lift, 6, 2, PALETTE.clayLight);
            px(6, 6 + lift, 1, 1, COLORS.ink);
            px(9, 6 + lift, 1, 1, COLORS.ink);
            px(5, 10 + lift, 6, 1, COLORS.ink);
            px(6 + tail, 11 + lift, 4, 1, COLORS.grunt);
            px(7 + tail, 12 + lift, 2, 1, PALETTE.mint);
        });
    }

    // Runner — a fast flier: the wings flap through four phases, no legs below.
    for (let frame = 0; frame < ENEMY_ANIM.runner.frames; frame++) {
        const flap = frame % 4;
        const lift = flap % 2;
        enemyTexture(scene, 'runner', frame, 16, 2, (px) => {
            if (flap < 2) {
                px(1, 3 + lift, 5, 3, COLORS.ink);
                px(2, 4 + lift, 3, 1, COLORS.runner);
                px(10, 3 + lift, 5, 3, COLORS.ink);
                px(11, 4 + lift, 3, 1, COLORS.runner);
            } else {
                px(1, 6 + lift, 5, 2, COLORS.ink);
                px(2, 7 + lift, 4, 1, COLORS.runner);
                px(10, 6 + lift, 5, 2, COLORS.ink);
                px(10, 7 + lift, 4, 1, COLORS.runner);
            }
            px(6, 4 + lift, 4, 7, COLORS.ink);
            px(7, 5 + lift, 2, 5, COLORS.runner);
            px(7, 6 + lift, 1, 1, COLORS.ink);
            px(8, 6 + lift, 1, 1, COLORS.ink);
            px(7, 11 + lift, 2, 1, PALETTE.sandLight);
        });
    }

    // Brute — a heavy hoverer whose lower body tapers to a single float trail.
    for (let frame = 0; frame < ENEMY_ANIM.brute.frames; frame++) {
        const lift = frame % 2;
        enemyTexture(scene, 'brute', frame, 18, 2, (px) => {
            px(2, 2 + lift, 3, 3, COLORS.ink);
            px(13, 2 + lift, 3, 3, COLORS.ink);
            px(3, 3 + lift, 1, 1, COLORS.goldBright);
            px(14, 3 + lift, 1, 1, COLORS.goldBright);
            px(3, 4 + lift, 12, 9, COLORS.ink);
            px(4, 5 + lift, 10, 7, COLORS.brute);
            px(4, 5 + lift, 10, 2, PALETTE.plumLight);
            px(6, 8 + lift, 2, 2, COLORS.ink);
            px(10, 8 + lift, 2, 2, COLORS.ink);
            px(5, 13 + lift, 8, 1, COLORS.ink);
            px(6, 14 + lift, 6, 1, COLORS.brute);
            px(8, 15 + lift, 2, 1, PALETTE.plumLight);
        });
    }

    // Boss — a crowned overlord suspended above the road, with a robe hem.
    for (let frame = 0; frame < ENEMY_ANIM.boss.frames; frame++) {
        const lift = frame % 2;
        enemyTexture(scene, 'boss', frame, 20, 2, (px) => {
            px(4, 3 + lift, 2, 3, COLORS.ink);
            px(9, 2 + lift, 2, 4, COLORS.ink);
            px(14, 3 + lift, 2, 3, COLORS.ink);
            px(5, 4 + lift, 1, 1, COLORS.goldBright);
            px(10, 3 + lift, 1, 1, COLORS.goldBright);
            px(15, 4 + lift, 1, 1, COLORS.goldBright);
            px(2, 6 + lift, 16, 10, COLORS.ink);
            px(3, 7 + lift, 14, 8, COLORS.boss);
            px(3, 7 + lift, 14, 2, PALETTE.berryLight);
            px(6, 10 + lift, 2, 2, COLORS.ink);
            px(12, 10 + lift, 2, 2, COLORS.ink);
            px(4, 16 + lift, 12, 1, COLORS.ink);
            px(5, 17 + lift, 10, 1, COLORS.boss);
            px(8, 18 + lift, 4, 1, PALETTE.berryLight);
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
                g.fillStyle(PALETTE.grassDark, 1);
                g.lineStyle(3, PALETTE.ink, 1);
                g.fillRoundedRect(2, 6, 32, 28, 8);
                g.strokeRoundedRect(2, 6, 32, 28, 8);
                // The barrel distinguishes the type.
                g.fillStyle(color, 1);
                if (type === 'dart') {
                    g.fillRoundedRect(12, 2, 12, 22, 5);
                    g.fillStyle(PALETTE.ink, 1);
                    g.fillRect(16, 0, 4, 8);
                } else if (type === 'cannon') {
                    g.fillCircle(18, 16, 10);
                    g.fillStyle(PALETTE.ink, 1);
                    g.fillRoundedRect(14, 2, 8, 14, 3);
                } else {
                    polygon(g, 18, 14, 11, 4, Math.PI / 4);
                    g.fillStyle(PALETTE.cream, 0.85);
                    g.fillCircle(18, 14, 3);
                }
                // Level pips along the bottom edge.
                g.fillStyle(PALETTE.sandLight, 1);
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
            g.lineStyle(2, PALETTE.ink, 1);
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

/** One flat palette per map theme: grass, its patch, sand road and three gate tones. */
const BOARD_THEMES = [
    {
        grass: PALETTE.grass, patch: PALETTE.leaf, edge: PALETTE.grassDark, road: PALETTE.sand,
        gate: PALETTE.sand, gateShade: PALETTE.sandShade, gateLight: PALETTE.sandLight,
    },
    {
        grass: PALETTE.jade, patch: PALETTE.jadeLight, edge: PALETTE.jadeDark, road: PALETTE.ochre,
        gate: PALETTE.moss, gateShade: PALETTE.leaf, gateLight: PALETTE.sage,
    },
    {
        grass: PALETTE.olive, patch: PALETTE.oliveLight, edge: PALETTE.oliveDark, road: PALETTE.sandShade,
        gate: PALETTE.ochre, gateShade: PALETTE.sandDeep, gateLight: PALETTE.wheat,
    },
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
                ctx.fillStyle = hex(PALETTE.sandDeep);
                ctx.fillRect(Math.round(x - trunk / 2), Math.round(y - crown * 0.45), trunk, Math.round(crown * 0.45));
                ctx.fillStyle = hex(theme.edge);
                ctx.fillRect(Math.round(x - crown / 2), Math.round(y - crown), crown, Math.round(crown * 0.65));
                ctx.fillStyle = hex(theme.patch);
                ctx.fillRect(Math.round(x - crown / 3), Math.round(y - crown * 0.95), Math.round(crown * 0.66), Math.round(crown * 0.4));
            } else if (kind === 'rock') {
                const size = Math.round(tile * 0.45);
                ctx.fillStyle = hex(PALETTE.stone);
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size), size, size);
                ctx.fillStyle = hex(PALETTE.stoneLight);
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size), size, Math.round(size / 3));
            } else {
                const size = Math.round(tile * 0.3);
                ctx.fillStyle = hex(PALETTE.cream);
                ctx.fillRect(Math.round(x - size / 5), Math.round(y - size), Math.round(size * 0.4), size);
                ctx.fillStyle = hex(PALETTE.clay);
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size * 1.2), size, Math.round(size * 0.5));
            }
        }
    }

    // Shapes are bottom-anchored in their own cell; keep the bounds explicit for readers.
    void width;
    void height;
}

/**
 * The gate the player defends: the remade pixel castle, three tiles wide and themed
 * sand / leaf / ochre. The same drawing is used for the Play Screen icon.
 */
function paintGate(ctx: Ctx, map: GameMap, tile: number): void {
    const gate = map.waypoints[map.waypoints.length - 1];
    const theme = themeOf(map);
    const w = tile * 3;
    const h = Math.round(tile * 2);
    const x = Math.round(gate.x * tile - w / 2);
    const y = Math.round(gate.y * tile + tile * 0.32 - h);
    drawGateShape(ctx, x, y, w, h, theme.gate, theme.gateShade, theme.gateLight);
}
