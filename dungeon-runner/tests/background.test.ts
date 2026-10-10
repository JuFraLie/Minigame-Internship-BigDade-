// tests/background.test.ts — the torch rhythm of the corridor: at ANY screen
// width (a 9:16 screen above all) and at any scroll position the candles keep
// one exact step between them, so they can never pile up on the same pixel and
// fuse into a single smear of flame.

import assert from 'node:assert/strict';
import test from 'node:test';

import { torchScreenXs } from '../src/render/background.ts';

const STEP = 320; // the rhythm the corridor promises (see background.ts)

// Narrow and wide, portrait and 9:16 — the widths the wrap bug used to break.
const WIDTHS = [320, 360, 390, 411, 432, 480, 720];
const SCROLLS = [0, 25, 160, 320, 1000, 4096, 12345, 98765];

test('torches keep one exact step apart on every screen width', () => {
  for (const w of WIDTHS) {
    for (const s of SCROLLS) {
      const xs = torchScreenXs(w, s).map(t => t.x).sort((a, b) => a - b);

      assert.ok(xs.length >= 1, `gw=${w} scroll=${s}: a corridor with no candle at all`);

      for (let i = 1; i < xs.length; i++) {
        const gap = xs[i] - xs[i - 1];
        assert.ok(
          Math.abs(gap - STEP) < 1e-6,
          `gw=${w} scroll=${s}: candles ${i - 1} and ${i} are ${gap}px apart, expected ${STEP}`,
        );
      }
    }
  }
});

test('no candle is ever drawn twice on the same screen', () => {
  for (const w of WIDTHS) {
    const maxXs = Math.ceil((w + 120) / STEP) + 1; // the widest run that fits
    for (const s of SCROLLS) {
      const ts = torchScreenXs(w, s);
      assert.ok(
        ts.length <= maxXs,
        `gw=${w} scroll=${s}: ${ts.length} candles on screen, at most ${maxXs} fit`,
      );
      // Distinct world indices — duplicates are exactly what fuses the flames.
      assert.equal(new Set(ts.map(t => t.i)).size, ts.length, `gw=${w} scroll=${s}: a repeated index`);
    }
  }
});

test('a candle scrolls with the world instead of teleporting', () => {
  // Wrapping happens on the INDEX, so a candle glides left and only leaves
  // through the left edge — it never jumps across the screen.
  const seen = torchScreenXs(390, 0).find(t => t.x > 0 && t.x < 390);
  assert.ok(seen, 'a reference candle is on screen at scroll 0');

  let prev = seen.x;
  let visited = 0;
  for (let s = 10; s <= 120; s += 10) {
    const same = torchScreenXs(390, s).find(t => t.i === seen.i);
    if (!same) continue;
    const moved = same.x - prev;
    assert.ok(
      moved < 0 && moved > -7.5, // parallax 0.7 × 10px of scroll
      `scroll=${s}: the candle jumped ${moved}px instead of gliding`,
    );
    prev = same.x;
    visited++;
  }
  assert.ok(visited >= 5, 'the candle stayed on screen through the whole sweep');
});
