import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Phaser's Text records `frame.source.resolution` once, in the constructor, from the
 * style object. A later `setResolution(2)` re-renders the internal canvas at 2x, but the
 * Canvas renderer still divides by the stale source resolution of 1 — so every glyph is
 * drawn twice as large. That made the whole UI look oversized and chunky on a phone
 * (devicePixelRatio >= 1.5), while a desktop browser (dpr 1) looked fine.
 *
 * The style has to be built with the resolution already set. Phaser cannot be imported
 * in the headless Node test runner, so this suite guards the source contract directly,
 * the same way `layers.test.ts` and `noAssets.test.ts` guard their invariants.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UI_STYLE = readFileSync(join(ROOT, 'src', 'adapters', 'phaser', 'uiStyle.ts'), 'utf8');

test('text resolution is set on the constructor style', () => {
    // The style object handed to scene.add.text must carry the resolution, so Phaser's
    // Text constructor copies it to the texture source the Canvas renderer divides by.
    const style = UI_STYLE.slice(UI_STYLE.indexOf('const style:'), UI_STYLE.indexOf('return scene.add.text'));
    assert.match(style, /resolution:\s*textResolution\(\)/, 'resolution must be part of the Text style');
});

test('no code calls setResolution after Text construction', () => {
    assert.ok(
        !/\b(?:text|this)\.setResolution\s*\(/.test(UI_STYLE),
        'setResolution() after construction leaves the texture source resolution at 1',
    );
});
