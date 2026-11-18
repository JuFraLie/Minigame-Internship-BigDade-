import Phaser from 'phaser';

import { GRID_HEIGHT, GRID_WIDTH, distanceToRoad, measureRoad, type GameMap } from '../../domain/maps.ts';
import { TOWER_TYPES, type EnemyType, type TowerType } from '../../domain/types.ts';
import { CASTLES, MAP_GRASS, ROAD_TILESET, SCENERY, STONE_TILESET } from './assetManifest.ts';
import { assetImage, bakeSprites } from './assets.ts';

/**
 * Textures: everything the game draws with.
 *
 * UI chrome (buttons, panels, capsules) is generated at boot with `Phaser.Graphics`
 * — no image file and no CDN (AGENTS.md §3.4). The chrome is carved-stone by design:
 * chamfered slabs with a light slate bevel over a dark slate fill, so the HUD reads as
 * part of the pack's pixel-art world rather than a modern overlay. The sprite pack in
 * `public/` supplies the game world: enemies, towers, shots, the grass field, the
 * tile-set road, the gate castle and the scenery, baked into the renderer's texture
 * keys by `assets.ts`. Entity textures are authored at a nominal tile of
 * `NOMINAL_TILE` px and scaled by the renderer, so a resize never regenerates
 * anything but the board itself. Any entity texture the pack did not provide falls
 * back to the old procedural drawing, so a missing file never stops a round.
 *
 * Two surfaces are cut from the pack itself rather than drawn: the build pads (a
 * silvered slab of the stone tile set, so a pad reads as pavement) and the Play
 * Screen's title plaque (the same stone, behind the gold title).
 */

export const NOMINAL_TILE = 44;

export const COLORS = {
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
    goldDark: 0x8a7426,
    /** Slate sampled from the stone tile set, darkened for chrome fills. */
    stone: 0x27314e,
    stoneEdge: 0x9db0cf,
    stoneShadow: 0x151b2e,
    capsule: 0x27314e,
    capsuleEdge: 0x9db0cf,
    button: 0x2c3854,
    buttonEdge: 0x9db0cf,
    buttonPrimary: 0x7d6a24,
    buttonDanger: 0x5c2f36,
    buttonDisabled: 0x242a3a,
    buttonDisabledEdge: 0x4a5163,
    panel: 0x1a2340,
    panelEdge: 0x8fa2c4,
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
    /** Ink behind every label stroke, so text survives on grass or stone alike. */
    ink: 0x0d1524,
} as const;

export function hex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
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

/**
 * A chamfered rectangle: the blocky, carved-stone outline the pixel art asks for,
 * instead of a modern rounded pill. `cut` is the corner notch in pixels.
 */
function chamfer(x: number, y: number, width: number, height: number, cut: number): Phaser.Geom.Point[] {
    const c = Math.min(cut, width / 2, height / 2);
    return [
        new Phaser.Geom.Point(x + c, y),
        new Phaser.Geom.Point(x + width - c, y),
        new Phaser.Geom.Point(x + width, y + c),
        new Phaser.Geom.Point(x + width, y + height - c),
        new Phaser.Geom.Point(x + width - c, y + height),
        new Phaser.Geom.Point(x + c, y + height),
        new Phaser.Geom.Point(x, y + height - c),
        new Phaser.Geom.Point(x, y + c),
    ];
}

/**
 * Fills a chamfered slab, strokes a light bevel around it and drops a dark inner
 * line just inside — the double border that makes flat colour read as carved stone.
 */
function slab(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    cut: number,
    fill: number,
    edge: number,
    inner: number,
    alpha = 1,
): void {
    const outer = chamfer(x, y, width, height, cut);
    g.fillStyle(fill, alpha);
    g.fillPoints(outer, true);
    g.lineStyle(3, edge, 1);
    g.strokePoints(outer, true);
    const inset = 4;
    const line = chamfer(x + inset, y + inset, width - inset * 2, height - inset * 2, Math.max(1, cut - 2));
    g.lineStyle(1, inner, 1);
    g.strokePoints(line, true);
}

function ensure(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
}

/** Solid white block; stretched and tinted for fills, flashes and the pause dim. */
function ensureWhite(scene: Phaser.Scene): void {
    ensure(scene, 'ui-white', 8, 8, (g) => {
        g.fillStyle(COLORS.white, 1);
        g.fillRect(0, 0, 8, 8);
    });
}

function ensureChrome(scene: Phaser.Scene): void {
    ensure(scene, 'ui-capsule', 120, 40, (g) => {
        slab(g, 2, 2, 116, 36, 5, COLORS.capsule, COLORS.capsuleEdge, COLORS.stoneShadow);
    });
    const button = (key: string, fill: number, edge: number, inner: number): void => {
        ensure(scene, key, 240, 56, (g) => {
            slab(g, 2, 2, 236, 52, 7, fill, edge, inner);
        });
    };
    button('ui-button', COLORS.button, COLORS.buttonEdge, COLORS.stoneShadow);
    // Primary is gate gold: the one button that carries the round forward.
    button('ui-button-primary', COLORS.buttonPrimary, COLORS.gold, COLORS.goldDark);
    button('ui-button-danger', COLORS.buttonDanger, 0xc46a72, 0x3a1e23);
    button('ui-button-disabled', COLORS.buttonDisabled, COLORS.buttonDisabledEdge, 0x1a1f2c);

    // Build buttons carry their tower's colour, so the bar reads at a glance.
    button('ui-button-dart', COLORS.button, COLORS.dart, COLORS.stoneShadow);
    button('ui-button-cannon', COLORS.button, COLORS.cannon, COLORS.stoneShadow);
    button('ui-button-frost', COLORS.button, COLORS.frost, COLORS.stoneShadow);

    ensure(scene, 'ui-panel', 360, 320, (g) => {
        slab(g, 2, 2, 356, 316, 9, COLORS.panel, COLORS.panelEdge, COLORS.stoneShadow, 0.97);
    });
}

// -- surfaces cut from the pack ---------------------------------------------

/** Texture key for a build pad: a silvered slab of the pack's stone tile set. */
export const PAD_KEY = 'ui-pad';

/** Nominal pad edge in texture pixels — native stone bricks, never scaled on bake. */
const PAD_TEXTURE = 40;

/**
 * Bakes the build pad from the stone tile set: a 40 px window of the 48 px frame,
 * lifted toward silver so it reads as pavement laid on the grass, then cut with a
 * bright rim and a dark inner line. Without the pack the pad is still a silver slab,
 * so a missing file never hides a build spot. Runs after the pack is preloaded.
 */
export function ensurePadTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PAD_KEY)) return;
    const size = PAD_TEXTURE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stone = assetImage(scene, STONE_TILESET.file);
    if (stone) {
        // Crop, don't scale: the brick pattern keeps its native pixels.
        const offset = Math.floor((STONE_TILESET.frameSize - size) / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(stone, offset, offset, size, size, 0, 0, size, size);
        ctx.fillStyle = 'rgba(224, 229, 238, 0.45)';
        ctx.fillRect(0, 0, size, size);
    } else {
        ctx.fillStyle = hex(COLORS.padSilver);
        ctx.fillRect(0, 0, size, size);
    }

    // Carved edge: ink outline, silver rim, shade line inside.
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
}

/** Chamfered path on a 2D context — the same carved corner as the chrome slabs. */
function chamferPath(ctx: Ctx, x: number, y: number, width: number, height: number, cut: number): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + width - cut, y);
    ctx.lineTo(x + width, y + cut);
    ctx.lineTo(x + width, y + height - cut);
    ctx.lineTo(x + width - cut, y + height);
    ctx.lineTo(x + cut, y + height);
    ctx.lineTo(x, y + height - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

/**
 * The Play Screen's title plaque: the stone tile set repeated at native size (a
 * pattern never stretches, so the bricks stay crisp at any width), pushed back
 * behind a dark wash and cut with a gold bevel. Rebaked on every call — a viewport
 * change resizes it.
 */
export function renderTitlePlaque(scene: Phaser.Scene, width: number, height: number): void {
    const key = 'ui-plaque';
    if (scene.textures.exists(key)) scene.textures.remove(key);

    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stone = assetImage(scene, STONE_TILESET.file);
    const pattern = stone ? ctx.createPattern(stone, 'repeat') : null;
    ctx.fillStyle = pattern ?? hex(COLORS.stone);
    ctx.fillRect(0, 0, w, h);
    // The wash keeps the gold title readable on the masonry.
    ctx.fillStyle = 'rgba(13, 21, 36, 0.55)';
    ctx.fillRect(0, 0, w, h);

    chamferPath(ctx, 1.5, 1.5, w - 3, h - 3, 7);
    ctx.strokeStyle = hex(COLORS.gold);
    ctx.lineWidth = 3;
    ctx.stroke();
    chamferPath(ctx, 6.5, 6.5, w - 13, h - 13, 4);
    ctx.strokeStyle = 'rgba(13, 21, 36, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    scene.textures.addCanvas(key, canvas);
}

// -- procedural fallbacks ---------------------------------------------------
//
// The pack normally provides every entity texture, so these run only when a file is
// missing. They keep the old shapes under the pack's texture keys (`enemy-<type>-0`),
// so the renderer needs no branch either way.

function ensureEnemies(scene: Phaser.Scene): void {
    const enemy = (type: EnemyType, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
        ensure(scene, `enemy-${type}-0`, size, size, (g) => {
            g.lineStyle(3, 0x0d1524, 1);
            draw(g);
        });
    };

    enemy('grunt', 28, (g) => {
        g.fillStyle(COLORS.grunt, 1);
        g.fillCircle(14, 14, 12);
        g.strokeCircle(14, 14, 12);
        g.fillStyle(0x7e2a28, 1);
        g.fillCircle(14, 14, 4);
    });
    enemy('runner', 26, (g) => {
        g.fillStyle(COLORS.runner, 1);
        polygon(g, 13, 13, 11, 4, Math.PI / 4);
        g.fillStyle(0x8a5d16, 1);
        g.fillCircle(13, 13, 3);
    });
    enemy('brute', 34, (g) => {
        g.fillStyle(COLORS.brute, 1);
        g.fillRoundedRect(3, 3, 28, 28, 7);
        g.strokeRoundedRect(3, 3, 28, 28, 7);
        g.fillStyle(0x4d3a70, 1);
        g.fillRoundedRect(9, 9, 16, 16, 4);
    });
    enemy('boss', 48, (g) => {
        g.fillStyle(COLORS.boss, 1);
        polygon(g, 24, 24, 21, 6, Math.PI / 6);
        g.fillStyle(0x5c1522, 1);
        polygon(g, 24, 24, 10, 6, Math.PI / 6);
        g.lineStyle(3, 0xf0c0c0, 1);
        polygon(g, 24, 24, 21, 6, Math.PI / 6);
    });
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

/** Generates the UI chrome. Idempotent, so a scene restart is free. */
export function ensureTextures(scene: Phaser.Scene): void {
    ensureWhite(scene);
    ensureChrome(scene);
}

/**
 * Generates every entity texture: the sprite pack where it is loaded, the procedural
 * shapes wherever it is not. Runs from the renderer's `create()`, i.e. after the Game
 * scene's `preload()` has fetched the pack.
 */
export function ensureEntityTextures(scene: Phaser.Scene): void {
    bakeSprites(scene);
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
    const ctx = texture.context;
    ctx.imageSmoothingEnabled = false;

    paintField(ctx, scene, map, width, height, tile);
    paintRoad(ctx, scene, map, tile);
    paintScenery(ctx, scene, map, tile, width, height);
    paintGate(ctx, scene, map, tile);

    texture.refresh();
}

/**
 * The grass field: one pack tile per map, drawn identically in every grid cell, so
 * the ground is as uniform as the design reference. The rim separates it from the void.
 */
function paintField(ctx: Ctx, scene: Phaser.Scene, map: GameMap, width: number, height: number, tile: number): void {
    const index = map.theme % MAP_GRASS.length;
    const source = assetImage(scene, MAP_GRASS[index]);

    for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        for (let gx = 0; gx < GRID_WIDTH; gx++) {
            if (source) {
                ctx.drawImage(source, gx * tile, gy * tile, tile, tile);
            } else {
                ctx.fillStyle = hex(COLORS.grass);
                ctx.fillRect(gx * tile, gy * tile, tile, tile);
            }
        }
    }

    // The rim that separates the field from the void.
    ctx.strokeStyle = hex(COLORS.grassEdge);
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.strokeRect(0, 0, width, height);
}

/**
 * The road, built from the ground tile set the way the reference screenshot does it:
 * every grid cell the centreline touches is filled with the set's flat dirt colour,
 * then its rim strips — the dark bumps against the grass — are stamped on each
 * grass-facing side. The strips are clipped to their cell and aligned to the frame's
 * three-cell period, so the bump pattern flows across neighbouring cells instead of
 * restarting at every one. Without the tile set the flat fill alone still reads as road.
 */
function paintRoad(ctx: Ctx, scene: Phaser.Scene, map: GameMap, tile: number): void {
    const road = measureRoad(map);
    const isRoad = (gx: number, gy: number): boolean =>
        gx < 0 ||
        gy < 0 ||
        gx >= GRID_WIDTH ||
        gy >= GRID_HEIGHT ||
        distanceToRoad(map, road, { x: gx + 0.5, y: gy + 0.5 }) <= 0.5 + 1e-9;

    ctx.fillStyle = hex(COLORS.road);
    for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        for (let gx = 0; gx < GRID_WIDTH; gx++) {
            if (isRoad(gx, gy)) ctx.fillRect(gx * tile, gy * tile, tile, tile);
        }
    }

    const strip = assetImage(scene, ROAD_TILESET.file);
    if (!strip) return;
    const { frameSize, rim } = ROAD_TILESET;
    const scale = tile / ROAD_TILESET.tileSize;
    const rimPx = rim * scale;
    const period = 3 * tile; // the 48 px frame spans exactly three cells

    const stamp = (
        gx: number,
        gy: number,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
    ): void => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(gx * tile, gy * tile, tile, tile);
        ctx.clip();
        ctx.drawImage(strip, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale);
        ctx.restore();
    };

    for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        for (let gx = 0; gx < GRID_WIDTH; gx++) {
            if (!isRoad(gx, gy)) continue;
            const spanX = Math.floor(gx / 3) * period;
            const spanY = Math.floor(gy / 3) * period;

            if (!isRoad(gx, gy - 1)) stamp(gx, gy, 0, 0, frameSize, rim, spanX, gy * tile);
            if (!isRoad(gx, gy + 1)) {
                stamp(gx, gy, 0, frameSize - rim, frameSize, rim, spanX, gy * tile + tile - rimPx);
            }
            if (!isRoad(gx - 1, gy)) stamp(gx, gy, 0, 0, rim, frameSize, gx * tile, spanY);
            if (!isRoad(gx + 1, gy)) {
                stamp(gx, gy, frameSize - rim, 0, rim, frameSize, gx * tile + tile - rimPx, spanY);
            }
        }
    }
}

/**
 * Trees, rocks and mushrooms, stamped off the road by a hash of the cell and the map
 * name — the same scenery every round, a different set on every layout.
 */
function paintScenery(ctx: Ctx, scene: Phaser.Scene, map: GameMap, tile: number, width: number, height: number): void {
    const road = measureRoad(map);
    const gate = map.waypoints[map.waypoints.length - 1];
    let seed = 17;
    for (const char of map.name) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;

    for (let cy = 0; cy < GRID_HEIGHT; cy++) {
        for (let cx = 0; cx < GRID_WIDTH; cx++) {
            const center = { x: cx + 0.5, y: cy + 0.5 };
            if (distanceToRoad(map, road, center) < 1.35) continue;
            // Scenery must clear the square pads and the three-tile gate castle.
            if (map.spots.some((spot) => Math.hypot(spot.x - center.x, spot.y - center.y) < 1.45)) continue;
            if (Math.hypot(gate.x - center.x, gate.y - center.y) < 2.3) continue;

            const hash = ((cx * 73856093) ^ (cy * 19349663) ^ seed) >>> 0;
            const roll = hash % 100;
            // 8% trees, 5% rocks, 4% mushrooms, of the eligible cells.
            const spec =
                roll < 8
                    ? SCENERY[hash % 5]
                    : roll < 13
                      ? SCENERY[5 + ((hash >> 5) % 3)]
                      : roll < 17
                        ? SCENERY[8 + ((hash >> 9) % 2)]
                        : undefined;
            if (!spec) continue;

            const source = assetImage(scene, spec.file);
            if (!source) continue;
            const scale = Math.max(1, Math.round((spec.heightTiles * tile) / source.height));
            const w = source.width * scale;
            const h = source.height * scale;
            const x = Math.round(Math.min(Math.max(cx * tile + tile / 2 - w / 2, 0), width - w));
            // Bottom-anchored in its cell, but never clipped off the top of the board.
            const y = Math.round(Math.max(0, Math.min((cy + 1) * tile - h + tile * 0.12, height - h)));
            ctx.drawImage(source, x, y, w, h);
        }
    }
}

/**
 * The gate the player is defending: the pack's castle standing on the bottom row
 * (blue / green / red by theme), three tiles wide. The old gold threshold with its
 * dark doorway only shows when the pack's castle is missing.
 */
function paintGate(ctx: Ctx, scene: Phaser.Scene, map: GameMap, tile: number): void {
    const gate = map.waypoints[map.waypoints.length - 1];
    const gx = gate.x * tile;
    const gy = gate.y * tile;

    const index = map.theme % CASTLES.length;
    const spec = CASTLES[index];
    const source = spec ? assetImage(scene, spec.file) : null;
    if (spec && source) {
        // The gate castle spans three tiles, like the design reference; its height
        // follows the art's aspect (pixel art must not stretch).
        const w = tile * 3;
        const h = Math.round((w * spec.frameHeight) / spec.frameWidth);
        const x = Math.round(gx - w / 2);
        const y = Math.round(gy + tile * 0.32 - h);
        ctx.drawImage(source, 0, 0, spec.frameWidth, spec.frameHeight, x, y, w, h);
        return;
    }

    ctx.fillStyle = hex(COLORS.gate);
    ctx.strokeStyle = '#8a7426';
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.beginPath();
    ctx.arc(gx, gy, tile * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hex(COLORS.void);
    ctx.fillRect(gx - tile * 0.26, gy - tile * 0.1, tile * 0.52, tile * 0.5);
}
