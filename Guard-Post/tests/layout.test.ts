import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HOW_TO_HEIGHT,
    MIN_TAP,
    computeMenuLayout,
    computePlayLayout,
    computeResultLayout,
    hitRect,
    type LayoutInput,
    type Rect,
} from '../src/adapters/phaser/layout.ts';
import { GRID_HEIGHT, GRID_WIDTH, MAPS } from '../src/domain/maps.ts';

/**
 * Screen geometry, tested as plain arithmetic — the same headless surface the input
 * adapter and the scenes use.
 *
 * The rules under test: portrait at *any* height with top padding that clears the
 * cutout, a board that always fits, menus that never leave the screen, and every touch
 * target at least 44 px. No aspect ratio is assumed anywhere.
 */

const HEIGHTS = [480, 640, 760, 844, 926, 1280] as const;
const ASPECTS = [0.46, 0.5625, 0.66, 0.75] as const;
const SAFE_TOPS = [0, 24, 59] as const;

const SPOTS = MAPS[0].spots;

function input(width: number, height: number, safeTop = 0, safeBottom = 0): LayoutInput {
    return { width, height, safeTop, safeBottom, spots: SPOTS };
}

function everyScreen(): readonly LayoutInput[] {
    const inputs: LayoutInput[] = [];
    for (const height of HEIGHTS) {
        for (const aspect of ASPECTS) {
            for (const safeTop of SAFE_TOPS) {
                const width = Math.max(1, Math.round(height * aspect));
                inputs.push(input(width, height, safeTop, safeTop > 0 ? 34 : 0));
            }
        }
    }
    return inputs;
}

test('top padding clears the status bar, 32 px and 6% of the height', () => {
    for (const safeTop of SAFE_TOPS) {
        for (const height of HEIGHTS) {
            const width = Math.round(height * 0.5625);
            const layout = computePlayLayout(input(width, height, safeTop));
            const required = Math.max(safeTop, 32, height * 0.06);
            assert.ok(
                layout.topPad >= required - 1e-9,
                `${width}x${height} safeTop ${safeTop}: pad ${layout.topPad} < ${required}`,
            );
        }
    }
});

test('the board fits any screen — every aspect ratio, every height', () => {
    for (const { width, height, safeTop, safeBottom } of everyScreen()) {
        const layout = computePlayLayout(input(width, height, safeTop, safeBottom));
        const board = layout.board;

        assert.ok(board.tile >= 8, `${width}x${height}: tile ${board.tile}`);
        assert.ok(board.x >= -1e-9, `${width}x${height}: board hangs off the left`);
        assert.ok(board.x + board.width <= width + 1e-9, `${width}x${height}: board hangs off the right`);
        assert.ok(board.y >= layout.hud.y + layout.hud.height, `${width}x${height}: board under the HUD`);
        assert.ok(
            board.y + board.height <= layout.callWave.y + 1e-9,
            `${width}x${height}: board overlaps the bottom bar`,
        );

        // The grid never changes shape; only its scale does.
        const ratio = board.width / board.height;
        assert.ok(Math.abs(ratio - GRID_WIDTH / GRID_HEIGHT) < 1e-9, `${width}x${height}: ratio ${ratio}`);
    }
});

test('every touch target is at least 44 px both ways', () => {
    for (const { width, height, safeTop, safeBottom } of everyScreen()) {
        const layout = computePlayLayout(input(width, height, safeTop, safeBottom));
        const targets: readonly Rect[] = [
            layout.hud.pause,
            layout.callWave,
            layout.resume,
            ...layout.menu.buildButtons,
            ...layout.menu.towerButtons,
        ];
        for (const target of targets) {
            assert.ok(target.width >= MIN_TAP, `${width}x${height}: target width ${target.width}`);
            assert.ok(target.height >= MIN_TAP, `${width}x${height}: target height ${target.height}`);
        }

        const menu = computeMenuLayout(input(width, height, safeTop, safeBottom));
        assert.ok(menu.play.width >= MIN_TAP && menu.play.height >= MIN_TAP, 'the Play button must be big');

        const result = computeResultLayout(input(width, height, safeTop, safeBottom));
        for (const target of [result.primary, result.exit]) {
            assert.ok(target.width >= MIN_TAP && target.height >= MIN_TAP, 'Result buttons must be big');
        }
    }
});

test('the HUD, menus and overlays stay inside the screen', () => {
    for (const { width, height, safeTop, safeBottom } of everyScreen()) {
        const layout = computePlayLayout(input(width, height, safeTop, safeBottom));

        // Capsules end before the pause button begins; everything sits in the row.
        let previousRight = 0;
        for (const capsule of [layout.hud.level, layout.hud.wave, layout.hud.lives, layout.hud.gold, layout.hud.score]) {
            assert.ok(capsule.x >= previousRight - 1e-9, 'HUD capsules must not overlap');
            assert.ok(capsule.x + capsule.width <= width + 1e-9, 'a capsule leaves the screen');
            previousRight = capsule.x + capsule.width;
        }
        assert.ok(layout.hud.pause.x + layout.hud.pause.width <= width + 1e-9, 'pause leaves the screen');

        const panel = layout.menu.panel;
        assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1e-9, 'the menu panel leaves the screen');
        assert.ok(panel.y >= 0 && panel.y + panel.height <= height + 1e-9, 'the menu panel leaves the screen');

        assert.ok(layout.callWave.x >= 0 && layout.callWave.x + layout.callWave.width <= width + 1e-9);
        assert.ok(layout.resume.x >= 0 && layout.resume.x + layout.resume.width <= width + 1e-9);

        // Build spots project onto the board, never off it.
        assert.equal(layout.spots.length, SPOTS.length);
        for (const spot of layout.spots) {
            assert.ok(spot.x >= layout.board.x && spot.x <= layout.board.x + layout.board.width);
            assert.ok(spot.y >= layout.board.y && spot.y <= layout.board.y + layout.board.height);
        }

        const menu = computeMenuLayout(input(width, height, safeTop, safeBottom));
        assert.ok(menu.play.x >= 0 && menu.play.x + menu.play.width <= width + 1e-9, 'Play leaves the screen');
        assert.ok(menu.play.y + menu.play.height <= height, 'Play leaves the screen');

        const result = computeResultLayout(input(width, height, safeTop, safeBottom));
        const panelRect = result.panel;
        assert.ok(panelRect.x >= 0 && panelRect.x + panelRect.width <= width + 1e-9, 'result panel leaves the screen');
        assert.ok(panelRect.y >= 0 && panelRect.y + panelRect.height <= height + 1e-9, 'result panel leaves the screen');
        for (const target of [result.primary, result.exit]) {
            assert.ok(target.x >= panelRect.x && target.x + target.width <= panelRect.x + panelRect.width + 1e-9);
            assert.ok(target.y >= panelRect.y && target.y + target.height <= panelRect.y + panelRect.height + 1e-9);
        }
    }
});

test('the Play Screen stacks title, icon, Play button and how-to in order', () => {
    for (const { width, height, safeTop, safeBottom } of everyScreen()) {
        const menu = computeMenuLayout(input(width, height, safeTop, safeBottom));
        assert.ok(menu.titleY > safeTop, 'the title clears the cutout');
        assert.ok(menu.icon.y > menu.titleY, 'the icon sits under the title');
        assert.ok(menu.play.y > menu.icon.y + menu.icon.radius, 'Play sits under the icon');
        assert.ok(menu.howToY > menu.play.y + menu.play.height, 'how-to sits under Play');
        assert.ok(menu.howToY < height, 'how-to text must be visible');

        // The title plaque is a backdrop only: it holds the title, never leaves the
        // screen, and never reaches down to the icon.
        const plate = menu.titlePlate;
        assert.ok(plate.x >= 0 && plate.x + plate.width <= width + 1e-9, 'the plaque leaves the screen');
        assert.ok(plate.y >= 0, 'the plaque leaves the screen');
        assert.ok(menu.titleY >= plate.y && menu.titleY <= plate.y + plate.height, 'the title is not on its plaque');
        assert.ok(plate.y + plate.height < menu.icon.y, 'the plaque overlaps the icon');
    }
});

test('the Result Panel stacks the title above the buttons, primary above exit', () => {
    for (const { width, height, safeTop, safeBottom } of everyScreen()) {
        const result = computeResultLayout(input(width, height, safeTop, safeBottom));
        assert.ok(result.titleY > result.panel.y, 'the title is inside the panel');
        assert.ok(result.bodyY > result.titleY, 'the body is under the title');
        assert.ok(result.primary.y > result.bodyY, 'primary is under the body');
        assert.ok(result.exit.y >= result.primary.y + result.primary.height, 'exit is under primary');
        assert.ok(result.exit.y + result.exit.height <= result.panel.y + result.panel.height + 1e-9);
    }
});

test('the credit sits at the bottom with a 44 px target, clear of the how-to text', () => {
    for (const { width, height, safeTop, safeBottom } of everyScreen()) {
        const menu = computeMenuLayout(input(width, height, safeTop, safeBottom));
        const credit = menu.credit;

        assert.ok(credit.width >= MIN_TAP && credit.height >= MIN_TAP, `${width}x${height}: credit is too small to tap`);
        assert.ok(credit.x >= 0 && credit.x + credit.width <= width + 1e-9, `${width}x${height}: credit leaves the screen`);
        assert.ok(
            credit.y >= 0 && credit.y + credit.height <= height - safeBottom + 1e-9,
            `${width}x${height}: credit leaves the screen`,
        );
        assert.ok(credit.y >= menu.howToY + HOW_TO_HEIGHT, `${width}x${height}: credit overlaps the how-to text`);
        assert.ok(credit.y > menu.play.y + menu.play.height, `${width}x${height}: credit overlaps Play`);
        assert.ok(Math.abs(credit.x + credit.width / 2 - width / 2) < 1e-9, 'the credit is centred');
    }
});

test('hitRect answers taps exactly inside its rectangle, grown by the pad', () => {
    const rect: Rect = { x: 100, y: 100, width: 50, height: 40 };

    assert.equal(hitRect(rect, 100, 100), true, 'the top-left corner counts');
    assert.equal(hitRect(rect, 150, 140), true, 'the bottom-right corner counts');
    assert.equal(hitRect(rect, 151, 120), false);
    assert.equal(hitRect(rect, 99, 120), false);
    assert.equal(hitRect(rect, 120, 141), false);

    // A pad widens acceptance on every side — the 44 px guarantee in action.
    assert.equal(hitRect(rect, 95, 120, 6), true);
    assert.equal(hitRect(rect, 93, 120, 6), false);
    assert.equal(hitRect(rect, 120, 145, 6), true);
    assert.equal(hitRect(rect, 120, 147, 6), false);
});
