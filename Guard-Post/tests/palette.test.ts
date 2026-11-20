import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PALETTE, UI_PALETTE } from '../src/adapters/phaser/palette.ts';

/**
 * The grass-and-sand look lives in one module. These guards stop a slate/grey UI from
 * creeping back in through a one-off hex value in a drawing function.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RENDER_DIR = join(ROOT, 'src', 'adapters', 'phaser');

test('every UI surface uses a named tone from the shared palette', () => {
    const tones = new Set<number>(Object.values(PALETTE));
    for (const [variant, colors] of Object.entries(UI_PALETTE)) {
        for (const [part, value] of Object.entries(colors)) {
            assert.ok(tones.has(value), `${variant}.${part} is not in PALETTE`);
        }
    }
});

test('the build menu keeps its earlier high-contrast tones', () => {
    assert.equal(UI_PALETTE.dart.body, PALETTE.dartBody);
    assert.equal(UI_PALETTE.dart.light, PALETTE.dartLight);
    assert.equal(UI_PALETTE.cannon.body, PALETTE.cannonBody);
    assert.equal(UI_PALETTE.cannon.light, PALETTE.cannonLight);
    assert.equal(UI_PALETTE.frost.body, PALETTE.frostBody);
    assert.equal(UI_PALETTE.frost.light, PALETTE.frostLight);
});

test('the renderer never invents its own colours', () => {
    const literal = /0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}/;
    for (const file of readdirSync(RENDER_DIR)) {
        if (!file.endsWith('.ts') || file === 'palette.ts') continue;
        const source = readFileSync(join(RENDER_DIR, file), 'utf8');
        assert.ok(!literal.test(source), `${file} hard-codes a colour; add it to palette.ts instead`);
    }
});
