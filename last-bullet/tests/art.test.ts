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
import { PANEL_BAND, PANEL_ROWS, WOOD } from '../src/presentation/art/PanelArt.ts';
import { FONT_ART, FONT_BODY, FONT_FAMILY, FONT_HEAD } from '../src/presentation/fonts.ts';

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

/**
 * The UI shell ships exactly one file - the typeface - and asks for it by path
 * at runtime: a typo would 404 and quietly leave the whole game in its system
 * font. The level-up cards ship nothing at all, their plank is drawn, so what
 * is checkable there is the thing a screenshot cannot promise: that the theme
 * really is light, and that the bands the text sits on fall inside the frame.
 */
describe('typeface', () => {
  test('the face the loader asks for is a TTF on disk', () => {
    assert.ok(FONT_ART.endsWith('.ttf'), `${FONT_ART} is not a TTF`);
    assert.ok(!FONT_ART.includes('undefined'), `${FONT_ART} is missing part of its name`);
    assert.ok(existsSync(join(PUBLIC, FONT_ART)), `${FONT_ART} is missing from public/`);
  });

  test('both text styles lead with that face, over a system fallback', () => {
    for (const style of [FONT_HEAD, FONT_BODY]) {
      assert.ok(style.startsWith(`"${FONT_FAMILY}"`), `${style} does not lead with ${FONT_FAMILY}`);
      assert.ok(style.includes('sans-serif'), `${style} has no fallback to fall back to`);
    }
  });
});

/** Perceptual weight of `#rrggbb` - enough to order pale against dark. */
const luminance = (hex: string): number => {
  const rgb = Number.parseInt(hex.slice(1), 16);
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
};

describe('upgrade plank', () => {
  test('the bands the cards lay text out on are ordered and inside the plank', () => {
    const { header, body, footer } = PANEL_BAND;
    assert.ok(header > 0, 'the header would sit above the plank');
    assert.ok(header < body && body < footer, 'the bands are out of order');
    assert.ok(footer < 1, 'the footer would sit below the plank');
  });

  test('the bands sit clear of the carved edge at either end', () => {
    assert.ok(PANEL_BAND.header > 1 / PANEL_ROWS, 'the header would sit on the outline');
    assert.ok(
      PANEL_BAND.footer < (PANEL_ROWS - 1) / PANEL_ROWS,
      'the footer would sit on the outline',
    );
  });

  test('it is a light theme: pale field, mid boards, dark carved edge', () => {
    assert.ok(luminance(WOOD.field) > luminance(WOOD.plank), 'the field must be the pale board');
    assert.ok(luminance(WOOD.plank) > luminance(WOOD.outline), 'the edge must be the darkest');
    assert.ok(luminance(WOOD.seam) > luminance(WOOD.field), 'the seam is the pale bead');
  });

  test('the grain is a wash, never opaque enough to mark a label', () => {
    const alpha = Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/.exec(WOOD.grain)?.[1] ?? '');
    assert.ok(alpha > 0 && alpha < 0.4, `grain alpha ${alpha} is not a wash`);
  });
});
