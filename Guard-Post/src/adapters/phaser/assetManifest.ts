import type { EnemyType, TowerType } from '../../domain/types.ts';

/**
 * The sprite pack manifest: every image file the game ships with, and how each one is
 * baked into a texture. Pure data with no Phaser import, so the test suite can audit
 * it directly — files exist, paths stay relative, and every entity type is covered.
 *
 * Files live under `public/` and are served as static assets next to the bundle
 * (AGENTS.md §3.4: bundled locally, no CDN). Paths are relative so the game works
 * from any base URL the host app serves it from.
 *
 * The renderer keys are fixed by the manifest: enemies bake to
 * `enemy-<type>-<frame>` textures driven by a `walk-<type>` animation, towers to
 * `tower-<type>-<level>`, shots to `shot-<type>`.
 */

/** A horizontal strip of equal frames, baked with an integer nearest-neighbour upscale. */
export interface StripSpec {
    readonly file: string;
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly frames: number;
    /** Integer scale applied when baking, so pixel art stays crisp at any screen size. */
    readonly scale: number;
    /** Walk-cycle speed of the baked animation, in frames per second. */
    readonly fps: number;
}

/** A single image baked with an integer nearest-neighbour upscale. */
export interface ImageSpec {
    readonly file: string;
    readonly scale: number;
}

/** Ground decoration stamped into the board; `heightTiles` is the wanted size on screen. */
export interface ScenerySpec {
    readonly file: string;
    readonly heightTiles: number;
}

/** One gate castle per map, in map order (blue / green / red). */
export interface CastleSpec {
    readonly file: string;
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly frames: number;
}

/**
 * The four enemy types, mapped to the pack: a skeleton for the grunt, a bat for the
 * runner, a demon for the brute and the crowned slime for the boss. Frame counts are
 * measured from the files (the strips are walk cycles of equal frames).
 */
export const ENEMY_STRIPS: Record<EnemyType, StripSpec> = {
    grunt: { file: 'Enemies/spr_skeleton.png', frameWidth: 8, frameHeight: 7, frames: 4, scale: 4, fps: 8 },
    runner: { file: 'Enemies/spr_bat.png', frameWidth: 8, frameHeight: 7, frames: 5, scale: 3, fps: 12 },
    brute: { file: 'Enemies/spr_demon.png', frameWidth: 8, frameHeight: 8, frames: 5, scale: 5, fps: 8 },
    boss: { file: 'Enemies/spr_king_slime.png', frameWidth: 16, frameHeight: 12, frames: 4, scale: 3, fps: 6 },
};

/** The three buildable towers: archer, cannon and ice wizard. */
export const TOWER_IMAGES: Record<TowerType, ImageSpec> = {
    dart: { file: 'Towers/Combat Towers/spr_tower_archer.png', scale: 3 },
    cannon: { file: 'Towers/Combat Towers/spr_tower_cannon.png', scale: 3 },
    frost: { file: 'Towers/Combat Towers/spr_tower_ice_wizard.png', scale: 3 },
};

/** Projectiles matching each tower: arrow, cannonball, ice shard. */
export const SHOT_IMAGES: Record<TowerType, ImageSpec> = {
    dart: { file: 'Towers/Combat Towers Projectiles/spr_tower_archer_projectile.png', scale: 2 },
    cannon: { file: 'Towers/Combat Towers Projectiles/spr_tower_cannon_projectile.png', scale: 2 },
    frost: { file: 'Towers/Combat Towers Projectiles/spr_tower_ice_wizard_projectile.png', scale: 2 },
};

/** Castle strips: frame 0 of each is the finished gate. */
export const CASTLES: readonly CastleSpec[] = [
    { file: 'Towers/Castle/spr_castle_blue.png', frameWidth: 52, frameHeight: 38, frames: 4 },
    { file: 'Towers/Castle/spr_castle_green.png', frameWidth: 52, frameHeight: 38, frames: 4 },
    { file: 'Towers/Castle/spr_castle_red.png', frameWidth: 52, frameHeight: 38, frames: 4 },
];

/** One grass tile per map, in map order (bright green / deep green / orange earth). */
export const MAP_GRASS: readonly string[] = [
    'Environment/Grass/spr_grass_01.png',
    'Environment/Grass/spr_grass_02.png',
    'Environment/Grass/spr_grass_03.png',
];

/**
 * The ground tile set the road is built from: a 48×48 frame of 16 px tiles whose
 * centre tile is transparent. The board paints the road fill with the frame's flat
 * dirt colour and stamps its four 4 px rim strips — the dark bumps — wherever the
 * road meets the grass.
 */
export const ROAD_TILESET = {
    file: 'Environment/Tile Set/spr_tile_set_ground.png',
    frameSize: 48,
    tileSize: 16,
    rim: 4,
} as const;

/** Trees, rocks and mushrooms scattered off the road by a deterministic hash. Trees are
 * two tiles tall, the big scenery of the design reference. */
export const SCENERY: readonly ScenerySpec[] = [
    { file: 'Environment/Decoration/spr_tree_01_normal.png', heightTiles: 2 },
    { file: 'Environment/Decoration/spr_tree_01_autumn.png', heightTiles: 2 },
    { file: 'Environment/Decoration/spr_tree_01_cherry_blossom.png', heightTiles: 2 },
    { file: 'Environment/Decoration/spr_tree_02_normal.png', heightTiles: 2 },
    { file: 'Environment/Decoration/spr_tree_02_spruce.png', heightTiles: 2 },
    { file: 'Environment/Decoration/spr_rock_01.png', heightTiles: 0.35 },
    { file: 'Environment/Decoration/spr_rock_02.png', heightTiles: 0.4 },
    { file: 'Environment/Decoration/spr_rock_03.png', heightTiles: 0.35 },
    { file: 'Environment/Decoration/spr_mushroom_01.png', heightTiles: 0.22 },
    { file: 'Environment/Decoration/spr_mushroom_02.png', heightTiles: 0.24 },
];

/** Every file the loader asks for, deduplicated. */
export const ALL_FILES: readonly string[] = [
    ...new Set([
        ...Object.values(ENEMY_STRIPS).map((spec) => spec.file),
        ...Object.values(TOWER_IMAGES).map((spec) => spec.file),
        ...Object.values(SHOT_IMAGES).map((spec) => spec.file),
        ...CASTLES.map((spec) => spec.file),
        ...MAP_GRASS,
        ROAD_TILESET.file,
        ...SCENERY.map((spec) => spec.file),
    ]),
];
