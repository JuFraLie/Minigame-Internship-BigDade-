import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  characterArtFiles,
  sideMirrored,
  WALK_FRAMES,
} from '../src/presentation/art/CharacterArt.ts';
import { LAND_BLOCK, LAND_CELL, LAND_VARIANTS, landArtFiles } from '../src/presentation/art/LandArt.ts';

/** `public/`, where the walk pack ships with the build. */
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/**
 * The manifest is the only thing that knows how the pack is named - typo'd
 * file names and all - so it is checked against the folder itself. A frame
 * that goes missing would 404, be skipped by the bake, and drop that
 * character silently back to its placeholder shape mid-run.
 */
describe('walk pack', () => {
  test('is four characters, three directions, three frames, no repeats', () => {
    const files = characterArtFiles();
    assert.equal(files.length, 4 * 3 * WALK_FRAMES);
    assert.equal(new Set(files).size, files.length, 'no frame is asked for twice');
  });

  test('every frame in the manifest is a file on disk', () => {
    const missing = characterArtFiles().filter((file) => !existsSync(join(PUBLIC, file)));
    assert.deepEqual(missing, [], 'frames the loader would 404 on');
  });

  test('every frame ships as a PNG', () => {
    for (const file of characterArtFiles()) {
      assert.ok(file.endsWith('.png'), `${file} is not a PNG`);
      assert.ok(!file.includes('undefined'), `${file} is missing part of its name`);
    }
  });

  test('the player mirrors going left, the zombies going right', () => {
    assert.equal(sideMirrored('player', -1), true, 'the player sheet faces +x');
    assert.equal(sideMirrored('player', 1), false);
    for (const id of ['zombie', 'fast', 'tank'] as const) {
      assert.equal(sideMirrored(id, 1), true, `${id} faces -x, so it mirrors going right`);
      assert.equal(sideMirrored(id, -1), false);
    }
  });
});

/**
 * The ground is scattered from the same manifest-first rule as the walk pack:
 * a tile that goes missing would 404 and quietly thin the scatter out, so the
 * list of files is checked against the folder it ships in.
 */
describe('land pack', () => {
  test('asks for every variant exactly once', () => {
    const files = landArtFiles();
    assert.equal(files.length, LAND_VARIANTS.length);
    assert.equal(new Set(files).size, files.length, 'no tile is asked for twice');
    for (const variant of LAND_VARIANTS) {
      assert.ok(files.includes(`assets/land/land-${variant}.png`), `land-${variant}.png`);
    }
  });

  test('every tile in the manifest is a PNG on disk', () => {
    for (const file of landArtFiles()) {
      assert.ok(file.endsWith('.png'), `${file} is not a PNG`);
      assert.ok(!file.includes('undefined'), `${file} is missing part of its name`);
      assert.ok(existsSync(join(PUBLIC, file)), `${file} is missing from public/`);
    }
  });

  test('the baked block is a whole number of tiles across', () => {
    assert.equal(LAND_BLOCK % LAND_CELL, 0, 'a partial tile at the edge would not tile');
    assert.ok(LAND_BLOCK > LAND_CELL, 'the block has to repeat, not be one tile');
  });
});
