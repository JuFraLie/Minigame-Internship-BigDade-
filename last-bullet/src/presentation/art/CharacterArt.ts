import type Phaser from 'phaser';

/**
 * The walk-cycle pack: four characters, three directions, three frames each,
 * living as PNGs under `public/assets/` (bundled with the build, nothing
 * remote - AGENTS.md A3.4).
 *
 * The frames are cropped tight to the pixels and are only a handful of pixels
 * tall, so they are baked up to their world size at boot into canvas textures
 * with nearest-neighbour scaling. After that nothing resamples them: the view
 * asks for a texture and a direction, and the pixels stay crisp no matter
 * what the camera does.
 *
 * If the pack is missing a file, the character simply keeps drawing the
 * placeholder shape from `TextureGenerator` - a missing PNG must never cost
 * the player a round.
 */

export type CharacterId = 'player' | 'zombie' | 'fast' | 'tank';
export type WalkDirection = 'front' | 'side' | 'back';

/** Frames in one walk cycle, and the rate the cycle runs at. */
export const WALK_FRAMES = 3;
export const WALK_FPS = 8;
/**
 * World units the player covers per frame step of its cycle. Counted in
 * distance rather than seconds so a sprint quickens the stride instead of
 * leaving the feet behind, and standing still parks the cycle on frame zero -
 * the standing pose - rather than marching on the spot.
 */
export const WALK_STRIDE = 20;

const DIRECTIONS: readonly WalkDirection[] = ['front', 'side', 'back'];
const CHARACTERS: readonly CharacterId[] = ['player', 'zombie', 'fast', 'tank'];

/** Folder and file prefix each character ships under, in `public/assets/`. */
const PACK: Record<CharacterId, { readonly dir: string; readonly prefix: string }> = {
  player: { dir: 'player-walking', prefix: 'player-walking' },
  zombie: { dir: 'zombie-walking', prefix: 'zombie-walking' },
  fast: { dir: 'kid-zombie-walking', prefix: 'kid-zombie-walking' },
  tank: { dir: 'big-zombie-walking', prefix: 'big-zombie-walking' },
};

/**
 * The three grown characters are drawn at one size in the pack, so they share
 * a scale and read as the same build of person - which is what makes the tank
 * look like a tank. The kid is drawn at roughly two thirds of that, so its
 * scale is gentler and its sprite lands on its own hitbox instead of
 * overhanging it.
 */
const SCALE: Record<CharacterId, number> = {
  player: 2.9,
  zombie: 2.9,
  fast: 2.4,
  tank: 3.2,
};

/** Where each character's side view points in world space: `1` for +x, `-1` for -x. */
const SIDE_FACING: Record<CharacterId, 1 | -1> = {
  player: 1,
  zombie: -1,
  fast: -1,
  tank: -1,
};

/**
 * Does travelling `dx` this way put the side view the wrong way round, so it
 * has to be mirrored? The player's sheet is drawn facing +x and the three
 * zombies' facing -x - one pack, two orientations - so the same direction
 * mirrors one and leaves the other alone. This is the whole of that rule,
 * kept apart from the drawing so it can be tested headless.
 */
export const sideMirrored = (id: CharacterId, dx: number): boolean =>
  dx * SIDE_FACING[id] < 0;

/** Placeholder shapes, baked by `TextureGenerator`, used when the pack is absent. */
const FALLBACK: Record<CharacterId, string> = {
  player: 'player',
  zombie: 'enemy_zombie',
  fast: 'enemy_fast',
  tank: 'enemy_tank',
};

/**
 * The pack's one badly named file: the shambler's second back frame ships as
 * `zombie-walking-2-bacl.png`. The manifest follows the disk, not the pattern,
 * so the walk cycle does not lose a leg to a typo.
 */
const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  'zombie-walking-2-back.png': 'zombie-walking-2-bacl.png',
};

/** Texture key of one baked frame. */
export const characterKey = (id: CharacterId, dir: WalkDirection, frame: number): string =>
  `walk_${id}_${dir}_${frame}`;

/** Texture key of the raw PNG, before it is baked up to world size. */
const sourceKey = (id: CharacterId, dir: WalkDirection, frame: number): string =>
  `raw_${id}_${dir}_${frame}`;

const fileName = (id: CharacterId, dir: WalkDirection, frame: number): string => {
  const plain = `${PACK[id].prefix}-${frame + 1}-${dir}.png`;
  return NAME_OVERRIDES[plain] ?? plain;
};

/** Relative to the page, so the game still finds its art under a sub-path. */
const urlFor = (id: CharacterId, dir: WalkDirection, frame: number): string =>
  `assets/${PACK[id].dir}/${fileName(id, dir, frame)}`;

/**
 * Every file the pack is made of, in load order. The test suite walks this
 * against `public/`, so a renamed PNG fails the build instead of quietly
 * dropping a character back to its placeholder shape.
 */
export const characterArtFiles = (): string[] => {
  const files: string[] = [];
  for (const id of CHARACTERS) {
    for (const dir of DIRECTIONS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        files.push(urlFor(id, dir, frame));
      }
    }
  }
  return files;
};

/**
 * Queues every frame of the pack. Meant to be called from a scene's
 * `preload()`; frames already baked are skipped, so a later scene asking
 * again costs nothing. Frames that fail to load are simply absent, and the
 * view falls back to the placeholder shape.
 */
export const queueCharacterArt = (scene: Phaser.Scene): void => {
  for (const id of CHARACTERS) {
    for (const dir of DIRECTIONS) {
      for (let frame = 0; frame < WALK_FRAMES; frame++) {
        if (scene.textures.exists(characterKey(id, dir, frame))) continue;
        scene.load.image(sourceKey(id, dir, frame), urlFor(id, dir, frame));
      }
    }
  }
};

/**
 * Bakes the loaded frames up to their world size, one texture per frame,
 * bottom-centred in a cell the size of the character's largest frame: every
 * frame then shares a centre and a ground line, so a walk cycle steps instead
 * of sliding. All-or-nothing per character - half a character would flicker
 * between art and placeholder as it turns.
 */
export const bakeCharacterArt = (scene: Phaser.Scene): void => {
  for (const id of CHARACTERS) bakeCharacter(scene, id);
};

const bakeCharacter = (scene: Phaser.Scene, id: CharacterId): void => {
  const scale = SCALE[id];
  const images: HTMLImageElement[][] = [];
  let cellW = 0;
  let cellH = 0;

  for (const dir of DIRECTIONS) {
    const row: HTMLImageElement[] = [];
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      if (scene.textures.exists(characterKey(id, dir, frame))) return; // already baked
      const source = scene.textures.exists(sourceKey(id, dir, frame))
        ? scene.textures.get(sourceKey(id, dir, frame))
        : undefined;
      if (!source) return; // a frame did not load: no art at all for this one
      // Only `load.image` ever queues these, so the source is a plain image.
      const image = source.source[0].image as HTMLImageElement;
      row.push(image);
      cellW = Math.max(cellW, Math.round(image.width * scale));
      cellH = Math.max(cellH, Math.round(image.height * scale));
    }
    images.push(row);
  }

  for (let d = 0; d < DIRECTIONS.length; d++) {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      const texture = scene.textures.createCanvas(characterKey(id, DIRECTIONS[d], frame), cellW, cellH);
      if (!texture) continue;
      const ctx = texture.getContext();
      const image = images[d][frame];
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      // Nearest neighbour, or pixel art this small turns to porridge.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, Math.round((cellW - width) / 2), cellH - height, width, height);
      texture.refresh();
    }
  }
};

/**
 * Points `image` where it is going and puts it on the right frame of the
 * cycle. `dx`/`dy` is the direction of travel in world space (y grows
 * downwards); the side view is mirrored when the travel direction is against
 * the way that character's sheet is drawn - see `SIDE_FACING`.
 *
 * `fallbackRotation` is what the placeholder shape is drawn with when the
 * pack is absent - the shapes are unidirectional, so they keep the old
 * "barrel along +x" behaviour instead of the four-way art.
 */
export const poseCharacter = (
  image: Phaser.GameObjects.Image,
  id: CharacterId,
  dx: number,
  dy: number,
  frame: number,
  fallbackRotation = 0,
): void => {
  const direction: WalkDirection =
    Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'front' : 'back') : 'side';
  const index = ((Math.floor(frame) % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
  const key = characterKey(id, direction, index);

  if (image.scene.textures.exists(key)) {
    image.setTexture(key);
    image.setFlipX(direction === 'side' && sideMirrored(id, dx));
    image.setRotation(0);
    return;
  }

  image.setTexture(FALLBACK[id]).setFlipX(false).setRotation(fallbackRotation);
};
