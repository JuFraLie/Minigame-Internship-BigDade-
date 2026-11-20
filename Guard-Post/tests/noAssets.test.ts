import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * This build is asset-free: every visual is generated in code. The suite guards that
 * decision so a stray sprite pack cannot creep back in and become a new source of
 * animation bugs. Only the font licence, the font file, the favicon and the page CSS
 * are allowed under public/.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const PUBLIC = join(ROOT, 'public');

function walk(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(path));
        else found.push(path);
    }
    return found;
}

test('no image or audio assets remain under public/', () => {
    const media = /\.(png|jpe?g|gif|webp|bmp|mp3|ogg|wav|m4a)$/i;
    const found = walk(PUBLIC).filter((file) => media.test(file)).map((file) => relative(PUBLIC, file));
    assert.deepEqual(found, [], 'the game must be rebuilt entirely in code');
});

test('source never loads or names a bundled image', () => {
    const forbidden = /load\.image|assetImage|preloadSprites|assetManifest|\.png['"]|\.jpg['"]/;
    const offenders = walk(SRC)
        .filter((file) => file.endsWith('.ts'))
        .filter((file) => forbidden.test(readFileSync(file, 'utf8')))
        .map((file) => relative(SRC, file));
    assert.deepEqual(offenders, [], 'asset loaders and file names must stay out of src/');
});

test('the deleted asset modules are gone', () => {
    assert.ok(!existsSync(join(SRC, 'adapters/phaser/assets.ts')));
    assert.ok(!existsSync(join(SRC, 'adapters/phaser/assetManifest.ts')));
});
