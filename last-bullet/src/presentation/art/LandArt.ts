import type Phaser from 'phaser';

/**
 * The ground: four seamless 16x16 dirt tiles shipping under
 * `public/assets/land/` (bundled with the build, nothing remote - AGENTS.md
 * A3.4).
 *
 * The tiles are far too small to be laid one-for-one over an arena measured
 * in hundreds of world units, so they are *composed* instead: one 512x512
 * block is baked at boot, and every cell of its 8x8 grid picks a variant at
 * random. The four tiles therefore end up scattered all over the land rather
 * than marching in a four-tile cycle, and the existing floor `TileSprite`
 * repeats that one block - still anchored to the arena, still one draw, still
 * no per-frame cost.
 *
 * A variant that failed to load is left out of the scatter rather than
 * costing the floor: whatever arrived is what the ground is made of, and if
 * nothing arrived the floor falls back to the grid baked by
 * `TextureGenerator`. A missing PNG must never cost the player a round.
 */

/** The four ground tiles, in load order. */
export type LandVariant = 'a' | 'b' | 'c' | 'd';

export const LAND_VARIANTS: readonly LandVariant[] = ['a', 'b', 'c', 'd'];

/** Texture key of the baked block, once it exists. */
export const LAND_KEY = 'land';

/** The floor's key when the pack is absent - see `TextureGenerator`. */
export const FALLBACK_KEY = 'grid';

/** World units one tile covers on the floor: chunky enough to read as ground. */
export const LAND_CELL = 64;

/** Edge of the baked block: 8 x 8 tiles, and one repeat of the floor pattern. */
export const LAND_BLOCK = 512;

const rawKey = (variant: LandVariant): string => `raw_land_${variant}`;

/** Relative to the page, so the game still finds its art under a sub-path. */
const urlFor = (variant: LandVariant): string => `assets/land/land-${variant}.png`;

/**
 * Every file the ground is made of. The test suite walks this against
 * `public/`, so a renamed or deleted tile fails the build instead of quietly
 * thinning the scatter out.
 */
export const landArtFiles = (): string[] => LAND_VARIANTS.map(urlFor);

/**
 * Queues the pack. Meant to be called from a scene's `preload()`; once the
 * block is baked there is nothing left to fetch, and a tile that never
 * arrives is simply absent from the scatter.
 */
export const queueLandArt = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(LAND_KEY)) return;
  for (const variant of LAND_VARIANTS) {
    if (scene.textures.exists(rawKey(variant))) continue;
    scene.load.image(rawKey(variant), urlFor(variant));
  }
};

/**
 * Bakes the floor block: every cell picks a variant at random, drawn up from
 * its native pixels with nearest neighbour so the art stays crisp instead of
 * turning to porridge. Safe to call from every scene - the block is baked
 * once per session, so the ground does not reshuffle between screens.
 */
export const bakeLandArt = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(LAND_KEY)) return;

  const tiles: HTMLImageElement[] = [];
  for (const variant of LAND_VARIANTS) {
    const source = scene.textures.exists(rawKey(variant))
      ? scene.textures.get(rawKey(variant))
      : undefined;
    // Only `load.image` ever queues these, so the source is a plain image.
    if (source) tiles.push(source.source[0].image as HTMLImageElement);
  }
  if (tiles.length === 0) return; // nothing arrived: the grid keeps the floor

  const texture = scene.textures.createCanvas(LAND_KEY, LAND_BLOCK, LAND_BLOCK);
  if (!texture) return;

  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  const cells = LAND_BLOCK / LAND_CELL;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      ctx.drawImage(tile, col * LAND_CELL, row * LAND_CELL, LAND_CELL, LAND_CELL);
    }
  }
  texture.refresh();
};

/** The key the floor should be drawn with: land once baked, the grid if not. */
export const floorKey = (scene: Phaser.Scene): string =>
  scene.textures.exists(LAND_KEY) ? LAND_KEY : FALLBACK_KEY;
