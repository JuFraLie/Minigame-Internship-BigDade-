import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ALL_FILES,
    CASTLES,
    ENEMY_STRIPS,
    FIELD_GRASS,
    SCENERY,
    SHOT_IMAGES,
    TOWER_IMAGES,
} from '../src/adapters/phaser/assetManifest.ts';
import { ENEMY_TYPES, TOWER_TYPES } from '../src/domain/types.ts';

/**
 * The sprite pack, audited against the disk.
 *
 * `assetManifest.ts` is the one place that names image files, so this suite is the
 * one place that proves they are real: every path exists under `public/`, stays
 * relative (the game is hosted from any base URL), and the frame geometry written
 * into the manifest matches the actual PNG dimensions — a wrong frame count would
 * slice enemies into garbage at runtime, which no other test can see.
 */

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

function pngSize(file: string): { width: number; height: number } {
    const buffer = readFileSync(join(PUBLIC_DIR, file));
    // PNG: 8-byte signature, then IHDR with big-endian width/height at offsets 16/20.
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('every manifest file exists in public/', () => {
    for (const file of ALL_FILES) {
        assert.ok(existsSync(join(PUBLIC_DIR, file)), `${file} is missing from public/`);
    }
    assert.ok(ALL_FILES.length >= 20, `expected the whole pack, found ${ALL_FILES.length} files`);
});

test('manifest paths are relative, forward-slashed and local', () => {
    for (const file of ALL_FILES) {
        assert.ok(file.endsWith('.png'), `${file} is not a png`);
        assert.ok(!file.includes('\\'), `${file} uses a backslash`);
        assert.ok(!file.startsWith('/'), `${file} is absolute; the game may be hosted from any base URL`);
        assert.ok(!file.includes('..'), `${file} escapes the asset folder`);
        assert.ok(!/:\/\//.test(file), `${file} points off-device`);
    }
});

test('ALL_FILES carries no duplicates', () => {
    assert.equal(new Set(ALL_FILES).size, ALL_FILES.length, 'a file listed twice is fetched twice');
});

test('every enemy and tower type has art', () => {
    assert.deepEqual(Object.keys(ENEMY_STRIPS).sort(), [...ENEMY_TYPES].sort());
    assert.deepEqual(Object.keys(TOWER_IMAGES).sort(), [...TOWER_TYPES].sort());
    assert.deepEqual(Object.keys(SHOT_IMAGES).sort(), [...TOWER_TYPES].sort());
});

test('strip geometry in the manifest matches the actual PNG frames', () => {
    for (const [type, spec] of Object.entries(ENEMY_STRIPS)) {
        const { width, height } = pngSize(spec.file);
        assert.equal(width, spec.frameWidth * spec.frames, `${type}: ${spec.file} is ${width}px wide, not ${spec.frames} frames`);
        assert.equal(height, spec.frameHeight, `${type}: ${spec.file} is ${height}px tall, not ${spec.frameHeight}`);
        assert.ok(Number.isInteger(spec.scale) && spec.scale >= 1, `${type}: scale must upscale, not blur`);
        assert.ok(spec.frameWidth * spec.scale <= 128, `${type}: baked frame would be oversized`);
        assert.ok(spec.fps >= 4, `${type}: walk cycle would strobe at ${spec.fps}fps`);
    }

    for (const spec of CASTLES) {
        const { width, height } = pngSize(spec.file);
        assert.equal(width, spec.frameWidth * spec.frames, `${spec.file} is ${width}px wide, not ${spec.frames} frames`);
        assert.equal(height, spec.frameHeight, `${spec.file} is ${height}px tall, not ${spec.frameHeight}`);
    }
});

test('the grass tiles share one square size, so the field pattern tiles cleanly', () => {
    const sizes = FIELD_GRASS.map((file) => pngSize(file));
    for (const size of sizes) {
        assert.equal(size.width, size.height, 'grass tiles must be square');
        assert.equal(size.width, sizes[0].width, 'grass tiles must share a size to composite');
    }
    assert.ok(sizes.length >= 2, 'the field needs more than one tile to break repetition');
});

test('scenery and single sprites are small pixel art, not upscaled photos', () => {
    for (const file of [...SCENERY.map((spec) => spec.file), ...Object.values(TOWER_IMAGES).map((spec) => spec.file), ...Object.values(SHOT_IMAGES).map((spec) => spec.file)]) {
        const { width, height } = pngSize(file);
        assert.ok(width <= 64 && height <= 64, `${file} is ${width}x${height}; the pack is pixel art`);
    }
});
