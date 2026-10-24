/**
 * portraitPlayfield: the layout is portrait-locked regardless of the window.
 *
 * The clamp is pure (no DOM, no Phaser at runtime) so it can be unit tested
 * headless. Everything on screen — canvas size, scene layout, world aspect —
 * is derived from this one function.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
    PORTRAIT_MAX_ASPECT,
    portraitPlayfield,
} from '../src/adapters/phaser/viewport.ts';

describe('portraitPlayfield', () => {
    it('leaves real portrait phones completely untouched', () => {
        for (const [w, h] of [
            [390, 844],   // iPhone 14
            [360, 800],   // common Android
            [320, 568],   // small/older phone (the widest real ratio, 0.563)
            [412, 915],   // tall Android
        ] as const) {
            assert.deepEqual(portraitPlayfield(w, h), { width: w, height: h });
        }
    });

    it('clamps a landscape phone to a centred portrait column', () => {
        const p = portraitPlayfield(844, 390);
        assert.equal(p.height, 390, 'keeps the full screen height');
        assert.equal(p.width, Math.round(390 * PORTRAIT_MAX_ASPECT));
        assert.ok(p.width < p.height, 'the playfield must be portrait-shaped');
        assert.ok(p.width <= 844, 'never wider than the window');
    });

    it('clamps squarer-than-portrait windows (tablets, desktop)', () => {
        const tablet = portraitPlayfield(1024, 768);
        assert.equal(tablet.height, 768);
        assert.ok(tablet.width / tablet.height <= PORTRAIT_MAX_ASPECT);

        const desktop = portraitPlayfield(1600, 900);
        assert.ok(desktop.width / desktop.height <= PORTRAIT_MAX_ASPECT);
        assert.equal(desktop.height, 900);
    });

    it('every result is a valid portrait playfield (aspect, bounds, minimums)', () => {
        const windows = [
            [844, 390], [1920, 1080], [500, 500], [768, 1024], [390, 844],
            [2560, 1440], [640, 360], [100, 800], [46, 900],
        ] as const;
        for (const [w, h] of windows) {
            const p = portraitPlayfield(w, h);
            assert.ok(p.width >= 1 && p.height >= 1, `minimum size for ${w}x${h}`);
            assert.ok(p.width <= w, `never overflows the window (${w}x${h})`);
            assert.ok(p.height <= h, `never overflows the window (${w}x${h})`);
            assert.ok(p.width / p.height <= PORTRAIT_MAX_ASPECT + 1e-9,
                `result ${p.width}x${p.height} must be portrait (${w}x${h})`);
            // Portrait windows must come back exactly as given.
            if (w / h <= PORTRAIT_MAX_ASPECT) {
                assert.deepEqual(p, { width: w, height: h });
            }
        }
    });

    it('survives degenerate input without producing a zero-size canvas', () => {
        assert.deepEqual(portraitPlayfield(0, 0), { width: 1, height: 1 });
        assert.deepEqual(portraitPlayfield(1, 1), { width: 1, height: 1 });
        const p = portraitPlayfield(0.4, 0.4);
        assert.ok(p.width >= 1 && p.height >= 1);
    });
});
