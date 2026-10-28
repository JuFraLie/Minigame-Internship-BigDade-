import test from 'node:test';
import assert from 'node:assert/strict';

import { hudLayout, menuLayout, pauseLayout, resultLayout } from '../src/adapters/phaser/layout.ts';
import type { Viewport } from '../src/adapters/phaser/viewport.ts';

/**
 * Every screen's layout must hold on the phones the game actually targets:
 * a small 320×568, a notched 390×844, a tall Android, and a landscape
 * window clamped to the portrait playfield (3:5).
 */
const VIEWPORTS: Viewport[] = [
    { width: 320, height: 568, safeTop: 0 },
    { width: 390, height: 844, safeTop: 47 },
    { width: 412, height: 915, safeTop: 24 },
    { width: 480, height: 800, safeTop: 0 },
];

test('menu layout keeps every element on screen and below the cutout', () => {
    for (const v of VIEWPORTS) {
        const l = menuLayout(v);
        assert.ok(l.titleY >= v.safeTop, 'title clears the cutout');
        assert.ok(l.howToY > l.titleY, 'how-to sits under the title');
        assert.ok(l.playY > l.howToY, 'play sits under the how-to');
        assert.ok(l.playY + l.playHeight / 2 <= v.height, 'play button fully on screen');
        assert.ok(l.playHeight >= 44, 'play button is a ~44pt touch target');
        assert.ok(
            l.howToWrapWidth > 0 && l.howToWrapWidth < v.width,
            'how-to wraps inside the screen (it used to run off both edges)',
        );
        assert.ok(l.soundButtonY - l.soundButtonSize / 2 >= v.safeTop, 'sound toggle clears the cutout');
        assert.ok(l.soundButtonX + l.soundButtonSize / 2 <= v.width, 'sound toggle stays on screen');
        assert.ok(l.soundButtonSize >= 44, 'sound toggle is a ~44pt touch target');
        assert.ok(
            l.soundButtonY + l.soundButtonSize / 2 < l.titleY - l.titleSize / 2,
            'sound toggle clears the title',
        );
    }
});

test('result layout stacks headline, stats and buttons inside the screen', () => {
    for (const v of VIEWPORTS) {
        const l = resultLayout(v);
        assert.ok(l.headlineY >= v.safeTop, 'headline clears the cutout');
        assert.ok(l.headlineY < l.waveY && l.waveY < l.scoreY, 'stats stack under the headline');
        assert.ok(l.scoreY < l.retryY && l.retryY < l.exitY, 'buttons stack under the stats');
        assert.ok(l.buttonHeight >= 44, 'result buttons are ~44pt touch targets');
        assert.ok(l.exitY + l.buttonHeight / 2 <= v.height, 'exit button fully on screen');
    }
});

test('pause layout sits below the HUD band and keeps resume on screen', () => {
    for (const v of VIEWPORTS) {
        const hud = hudLayout(v);
        const l = pauseLayout(v);
        assert.ok(
            l.pauseButtonY - l.pauseButtonSize / 2 >= hud.bandHeight,
            'pause button does not overlap the HUD band',
        );
        assert.ok(l.labelY < l.resumeY, 'PAUSED sits above RESUME');
        assert.ok(l.resumeY + l.resumeHeight / 2 <= v.height, 'resume fully on screen');
        assert.ok(l.resumeHeight >= 44, 'resume is a ~44pt touch target');
        assert.ok(
            l.soundButtonY - l.soundButtonSize / 2 >= l.resumeY + l.resumeHeight / 2,
            'sound toggle sits below RESUME',
        );
        assert.ok(l.soundButtonY + l.soundButtonSize / 2 <= v.height, 'sound toggle fully on screen');
        assert.ok(l.soundButtonSize >= 44, 'sound toggle is a ~44pt touch target');
    }
});

test('hud layout keeps the row inside the band and the banners on screen', () => {
    for (const v of VIEWPORTS) {
        const l = hudLayout(v);
        assert.ok(l.bandHeight >= v.height * 0.08, "band is at least the design doc's 8%");
        assert.ok(l.bandHeight <= v.height * 0.2, 'band does not eat the playfield');
        assert.ok(l.rowY > 0 && l.rowY < l.bandHeight, 'score row sits inside the band');
        assert.ok(l.comboY >= l.bandHeight, 'combo sits under the band');
        assert.ok(l.ballsX < v.width, 'ball counter is on screen');
        assert.ok(l.bannerY < v.height && l.serveY < v.height, 'banner and countdown are on screen');
        assert.ok(l.bannerY < l.serveY, 'banner above the countdown');
    }
});

test('layout is pure: the same viewport always gives the same numbers', () => {
    const v = VIEWPORTS[1];
    assert.deepEqual(menuLayout(v), menuLayout(v));
    assert.deepEqual(resultLayout(v), resultLayout(v));
    assert.deepEqual(pauseLayout(v), pauseLayout(v));
    assert.deepEqual(hudLayout(v), hudLayout(v));
});
