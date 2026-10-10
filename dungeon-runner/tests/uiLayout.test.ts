// tests/uiLayout.test.ts — the pure UI geometry: the shared button rects the
// renderer draws and the controller hit-tests, the reserved top padding, and
// the in-run HUD row (health + coins + score on one centre line), all on the
// range of portrait screens the app must support.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HEALTH, HUD, LAYOUT, UI } from '../src/config/gameConfig.ts';
import { hitTest, hudLayout, playButton, resultButtons, topPadFor } from '../src/core/uiLayout.ts';
import type { Rect } from '../src/core/types.ts';

/** Portrait sizes seen in the wild — none of them may break the layout. */
const PORTRAIT_SCREENS: readonly (readonly [number, number])[] = [
  [320, 480],
  [360, 640],
  [390, 844],
  [412, 915],
  [430, 932],
  [768, 1024],
];

const inside = (rect: Rect, w: number, h: number): boolean =>
  rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= w && rect.y + rect.h <= h;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('the Play Screen always shows a Play button, fully on screen', () => {
  for (const [w, h] of PORTRAIT_SCREENS) {
    const play = playButton(w, h);
    assert.ok(inside(play, w, h), `play button clipped on ${w}x${h}`);
    assert.ok(play.w >= w * 0.4, 'the start action must stay easy to hit');
    assert.ok(play.h >= h * 0.05, 'the start action must stay easy to hit');
  }
});

test('the Result Panel keeps Restart and Exit on screen and apart', () => {
  for (const [w, h] of PORTRAIT_SCREENS) {
    const { restart, exit } = resultButtons(w, h);
    assert.ok(inside(restart, w, h), `restart clipped on ${w}x${h}`);
    assert.ok(inside(exit, w, h), `exit clipped on ${w}x${h}`);
    assert.equal(overlaps(restart, exit), false, `buttons overlap on ${w}x${h}`);
    assert.ok(restart.h >= h * 0.04, 'a result action must stay easy to hit');
  }
});

test('the Play and Result buttons sit below the reserved top padding', () => {
  for (const [w, h] of PORTRAIT_SCREENS) {
    const top = topPadFor(h);
    assert.ok(playButton(w, h).y >= top, `play button under the cutout on ${w}x${h}`);
    assert.ok(resultButtons(w, h).restart.y >= top, `restart under the cutout on ${w}x${h}`);
  }
});

test('top padding scales with the screen but never swallows it', () => {
  assert.equal(topPadFor(10_000), Math.round(10_000 * LAYOUT.TOP_PAD_RATIO));
  for (const [, h] of PORTRAIT_SCREENS) {
    const top = topPadFor(h);
    assert.ok(top >= LAYOUT.TOP_PAD_MIN, 'always clears a status bar');
    assert.ok(top <= h * 0.1, 'never eats a meaningful part of the playfield');
  }
});

test('hitTest is inclusive on the edges and strict outside', () => {
  const rect = { x: 10, y: 20, w: 30, h: 40 };
  assert.equal(hitTest(rect, 10, 20), true);
  assert.equal(hitTest(rect, 40, 60), true);
  assert.equal(hitTest(rect, 9.9, 40), false);
  assert.equal(hitTest(rect, 40.1, 40), false);
  assert.equal(hitTest(rect, 25, 19.9), false);
  assert.equal(hitTest(rect, 25, 60.1), false);
});

test('the play button never collides with the result buttons of another screen', () => {
  const w = 390;
  const h = 844;
  const play = playButton(w, h);
  const { restart, exit } = resultButtons(w, h);
  assert.ok(UI.PLAY_Y_RATIO > 0 && UI.PLAY_Y_RATIO < 1);
  assert.equal(overlaps(play, restart), false);
  assert.equal(overlaps(play, exit), false);
});

test('the HUD is ONE row: health and score share a centre line', () => {
  for (const [w, h] of PORTRAIT_SCREENS) {
    const top = topPadFor(h);
    const l = hudLayout(w, top);

    // The hearts are centred on the digits' own optical centre: one height.
    assert.equal(
      l.centerY,
      l.baselineY - l.fontSize * HUD.DIGIT_CENTER_RATIO,
      `health and score split over two heights on ${w}x${h}`,
    );
    assert.ok(l.centerY > top, `HUD row under the cutout on ${w}x${h}`);
    assert.ok(l.heartSize > 0, 'health must be visible');
    assert.ok(l.heartSpacing > l.heartSize, 'hearts read as separate beats');
  }
});

test('the single HUD row fits: hearts, coins, HI and score, nothing clashing', () => {
  for (const [w, h] of PORTRAIT_SCREENS) {
    const l = hudLayout(w, topPadFor(h));

    const heartsRight =
      l.firstHeartX + (HEALTH.MAX_HEARTS - 1) * l.heartSpacing + l.heartSize;
    // The coin block is its icon plus "×9999" — the widest a run can show.
    const coinRight = l.coinTextX + l.coinFontSize * 0.6 * 5;
    // Monospace digits advance ≈ 0.6 em; the score is 5 digits, HI is "HI 00000".
    const scoreW = l.fontSize * 0.6 * 5;
    const hiW = l.hiFontSize * 0.6 * 8;
    const scoreSide = l.textRight - scoreW - hiW - l.hiGap;

    assert.ok(heartsRight < l.coinX - l.coinRadius, `coins sit inside the hearts on ${w}x${h}`);
    assert.ok(l.coinRadius > 0, 'the coin counter must be visible');
    assert.ok(coinRight < scoreSide, `coins and score collide on ${w}x${h}`);
    assert.ok(heartsRight < scoreSide, `health and score collide on ${w}x${h}`);
    assert.ok(l.textRight <= w - HUD.PAD_MIN, `score clipped on ${w}x${h}`);
    // The tallest item in the row still starts below the reserved top padding.
    assert.ok(l.centerY - l.heartSize >= topPadFor(h), `HUD under the cutout on ${w}x${h}`);
  }
});
