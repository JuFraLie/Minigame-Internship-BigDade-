import Phaser from 'phaser';

import { GRID_HEIGHT, GRID_WIDTH, MAPS, distanceToRoad, measureRoad, type GameMap } from '../../domain/maps.ts';
import { TOWER_TYPES, type EnemyType, type TowerType } from '../../domain/types.ts';
import { CASTLES, SCENERY } from './assetManifest.ts';
import { assetImage, bakeSprites } from './assets.ts';

/**
 * Textures: everything the game draws with.
 *
 * UI chrome (buttons, panels, capsules) is generated at boot with `Phaser.Graphics`
 * — no image file and no CDN (AGENTS.md §3.4). The sprite pack in `public/` supplies
 * the game world: enemies, towers, shots, the grass field, the gate castle and the
 * scenery, baked into the renderer's texture keys by `assets.ts`. Entity textures are
 * authored at a nominal tile of `NOMINAL_TILE` px and scaled by the renderer, so a
 * resize never regenerates anything but the board itself. Any entity texture the pack
 * did not provide falls back to the old procedural drawing, so a missing file never
 * stops a round.
 */

export const NOMINAL_TILE = 44;

export const COLORS = {
    void: 0x101a2e,
    grass: 0x27503b,
    grassEdge: 0x1f4131,
    road: 0x6f5a3a,
    roadEdge: 0x4a3b25,
    spot: 0x3d4f6b,
    spotRing: 0x6380ab,
    gate: 0xd9b64a,
    capsule: 0x22355c,
    capsuleEdge: 0x47618f,
    button: 0x2b4066,
    buttonEdge: 0x5c7bb0,
    buttonPrimary: 0x2e6f9e,
    buttonDanger: 0x94404a,
    buttonDisabled: 0x2c3140,
    buttonDisabledEdge: 0x4a5163,
    panel: 0x16233f,
    panelEdge: 0x3b5178,
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
    hp: 0x68d391,
    hpLost: 0x3a2029,
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
        g.fillStyle(COLORS.capsule, 1);
        g.lineStyle(2, COLORS.capsuleEdge, 1);
        g.fillRoundedRect(1, 1, 118, 38, 12);
        g.strokeRoundedRect(1, 1, 118, 38, 12);
    });
    const button = (key: string, fill: number, edge: number): void => {
        ensure(scene, key, 240, 56, (g) => {
            g.fillStyle(fill, 1);
            g.lineStyle(3, edge, 1);
            g.fillRoundedRect(2, 2, 236, 52, 14);
            g.strokeRoundedRect(2, 2, 236, 52, 14);
        });
    };
    button('ui-button', COLORS.button, COLORS.buttonEdge);
    button('ui-button-primary', COLORS.buttonPrimary, COLORS.buttonEdge);
    button('ui-button-danger', COLORS.buttonDanger, 0xc46a72);
    button('ui-button-disabled', COLORS.buttonDisabled, COLORS.buttonDisabledEdge);

    ensure(scene, 'ui-panel', 360, 320, (g) => {
        g.fillStyle(COLORS.panel, 0.97);
        g.lineStyle(3, COLORS.panelEdge, 1);
        g.fillRoundedRect(2, 2, 356, 316, 18);
        g.strokeRoundedRect(2, 2, 356, 316, 18);
    });
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
}

// ---------------------------------------------------------------------------
// The board — the one texture that depends on the layout
// ---------------------------------------------------------------------------

export const BOARD_KEY = 'board';
const FIELD_KEY = 'field-tiles';

type Ctx = CanvasRenderingContext2D;

/**
 * Paints grass, road, spots, scenery and the gate into a canvas texture sized for
 * `tile`. Regenerated when the layout changes; everything else is drawn once.
 */
export function renderBoardTexture(scene: Phaser.Scene, map: GameMap, tile: number): void {
    const width = Math.ceil(tile * GRID_WIDTH);
    const height = Math.ceil(tile * GRID_HEIGHT);

    if (scene.textures.exists(BOARD_KEY)) scene.textures.remove(BOARD_KEY);
    const texture = scene.textures.createCanvas(BOARD_KEY, width, height);
    if (!texture) return;
    const ctx = texture.context;
    ctx.imageSmoothingEnabled = false;

    paintField(ctx, scene, width, height, tile);
    paintRoad(ctx, map, tile);
    paintSpots(ctx, map, tile);
    paintScenery(ctx, scene, map, tile, width, height);
    paintGate(ctx, scene, map, tile);

    texture.refresh();
}

/** The grass field: a repeating pattern of the pack's three grass tiles, rimmed dark. */
function paintField(ctx: Ctx, scene: Phaser.Scene, width: number, height: number, tile: number): void {
    const source = scene.textures.exists(FIELD_KEY) ? scene.textures.get(FIELD_KEY).getSourceImage() : null;
    const field = source instanceof HTMLImageElement || source instanceof HTMLCanvasElement ? source : null;
    const pattern = field ? ctx.createPattern(field, 'repeat') : null;
    ctx.fillStyle = pattern ?? hex(COLORS.grass);
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = hex(COLORS.grassEdge);
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.strokeRect(0, 0, width, height);
}

/** The road: a wide dark edge under a lighter dirt surface. */
function paintRoad(ctx: Ctx, map: GameMap, tile: number): void {
    const roadWidth = tile * 1.05;
    const trace = (style: string, width: number): void => {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(map.waypoints[0].x * tile, map.waypoints[0].y * tile);
        for (let i = 1; i < map.waypoints.length; i++) {
            ctx.lineTo(map.waypoints[i].x * tile, map.waypoints[i].y * tile);
        }
        ctx.stroke();
    };
    trace(hex(COLORS.roadEdge), roadWidth + tile * 0.18);
    trace(hex(COLORS.road), roadWidth);
}

/** Build spots: pads with a ring, 1–2 tiles off the road. */
function paintSpots(ctx: Ctx, map: GameMap, tile: number): void {
    for (const spot of map.spots) {
        const cx = spot.x * tile;
        const cy = spot.y * tile;
        ctx.fillStyle = hex(COLORS.spot);
        ctx.strokeStyle = hex(COLORS.spotRing);
        ctx.lineWidth = Math.max(2, tile * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, tile * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.globalAlpha = 0.6;
        ctx.lineWidth = Math.max(1, tile * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, tile * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
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
            if (map.spots.some((spot) => Math.hypot(spot.x - center.x, spot.y - center.y) < 1.1)) continue;
            if (Math.hypot(gate.x - center.x, gate.y - center.y) < 1.7) continue;

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
            const y = Math.round(Math.min((cy + 1) * tile - h + tile * 0.12, height - h));
            ctx.drawImage(source, x, y, w, h);
        }
    }
}

/**
 * The gate the player is defending: a gold threshold with the pack's castle standing
 * on it (blue / green / red in map order). Without the pack, the old door shows.
 */
function paintGate(ctx: Ctx, scene: Phaser.Scene, map: GameMap, tile: number): void {
    const gate = map.waypoints[map.waypoints.length - 1];
    const gx = gate.x * tile;
    const gy = gate.y * tile;

    ctx.fillStyle = hex(COLORS.gate);
    ctx.strokeStyle = '#8a7426';
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.beginPath();
    ctx.arc(gx, gy, tile * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const index = Math.max(0, MAPS.indexOf(map)) % CASTLES.length;
    const spec = CASTLES[index];
    const source = spec ? assetImage(scene, spec.file) : null;
    if (spec && source) {
        const scale = Math.max(1, Math.round((tile * 1.3) / spec.frameWidth));
        const w = spec.frameWidth * scale;
        const h = spec.frameHeight * scale;
        const x = Math.round(gx - w / 2);
        const y = Math.round(gy + tile * 0.32 - h);
        ctx.drawImage(source, 0, 0, spec.frameWidth, spec.frameHeight, x, y, w, h);
        return;
    }

    ctx.fillStyle = hex(COLORS.void);
    ctx.fillRect(gx - tile * 0.26, gy - tile * 0.1, tile * 0.52, tile * 0.5);
}
