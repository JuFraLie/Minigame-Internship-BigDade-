import test from 'node:test';
import assert from 'node:assert/strict';

import { computeLayout, hitTest, type LayoutInput } from '../src/render/GameLayout.ts';

/** The awkward viewports a phone actually produces: short, tall, narrow and cut-out. */
const VIEWPORTS: readonly LayoutInput[] = [
    { width: 390, height: 844, safeTop: 0, safeBottom: 0, gridSize: 4, shapeCount: 4 },
    { width: 390, height: 844, safeTop: 44, safeBottom: 34, gridSize: 6, shapeCount: 6 },
    { width: 360, height: 568, safeTop: 0, safeBottom: 0, gridSize: 4, shapeCount: 4 },
    { width: 320, height: 1000, safeTop: 80, safeBottom: 20, gridSize: 6, shapeCount: 6 },
    { width: 430, height: 932, safeTop: 59, safeBottom: 34, gridSize: 6, shapeCount: 6 },
];

function describe(input: LayoutInput): string {
    return `${input.width}x${input.height} (${input.shapeCount} shapes)`;
}

test('the board sits below the HUD and above the tray on every viewport', () => {
    for (const input of VIEWPORTS) {
        const layout = computeLayout(input);
        const label = describe(input);

        assert.ok(layout.hud.y >= layout.topPad - 0.01, `HUD must clear the cutout — ${label}`);
        assert.ok(
            layout.hud.y + layout.hud.height <= layout.board.y + 0.01,
            `HUD must not overlap the board — ${label}`,
        );
        assert.ok(layout.board.y + layout.board.size <= layout.tray.y + 0.01, `board and tray overlap — ${label}`);
        assert.ok(
            layout.tray.y + layout.tray.height <= input.height + 0.01,
            `tray runs off the bottom — ${label}`,
        );
        assert.ok(layout.board.x >= 0, `board runs off the left — ${label}`);
        assert.ok(
            layout.board.x + layout.board.size <= input.width + 0.01,
            `board runs off the right — ${label}`,
        );
    }
});

test('top padding always covers both the status bar and eight percent of the height', () => {
    for (const input of VIEWPORTS) {
        const layout = computeLayout(input);
        assert.ok(layout.topPad >= input.safeTop, `cutout not respected at ${describe(input)}`);
        assert.ok(
            layout.topPad >= input.height * 0.08 - 0.01,
            `top padding short at ${describe(input)}`,
        );
    }
});

test('the board is a square at about 92 percent of the width when height allows', () => {
    for (const input of VIEWPORTS) {
        const layout = computeLayout(input);
        assert.ok(
            Math.abs(layout.board.size - input.width * 0.92) < 1,
            `board is ${layout.board.size.toFixed(1)} wide, expected ~${(input.width * 0.92).toFixed(1)} ` +
                `at ${describe(input)}`,
        );
    }
});

test('the cells divide the board exactly and leave a visible inset', () => {
    for (const input of VIEWPORTS) {
        const layout = computeLayout(input);
        assert.ok(
            Math.abs(layout.board.cell * input.gridSize - layout.board.size) < 0.01,
            `cells do not tile the board at ${describe(input)}`,
        );
        assert.ok(layout.board.inset > 0, `cells would touch at ${describe(input)}`);
        assert.ok(layout.board.inset * 2 < layout.board.cell, `inset swallows the cell at ${describe(input)}`);
    }
});

test('a short viewport still fits by shrinking the board rather than overflowing', () => {
    const layout = computeLayout({ width: 320, height: 480, safeTop: 0, safeBottom: 0, gridSize: 6, shapeCount: 6 });
    assert.ok(
        layout.tray.y + layout.tray.height <= 480,
        `stack overflows: bottom lands at ${(layout.tray.y + layout.tray.height).toFixed(1)}`,
    );
    assert.ok(layout.board.y > layout.hud.y, 'the HUD still precedes the board');
});

test('spare vertical height becomes spacing instead of a stretched board', () => {
    const short = computeLayout({ width: 390, height: 600, safeTop: 0, safeBottom: 0, gridSize: 4, shapeCount: 4 });
    const tall = computeLayout({ width: 390, height: 1200, safeTop: 0, safeBottom: 0, gridSize: 4, shapeCount: 4 });

    assert.equal(short.board.size, tall.board.size, 'the board is driven by width, not height');
    assert.ok(tall.hud.y > short.hud.y, 'the extra height is pushed into spacing above the HUD');
});

test('the tray offers one evenly spaced slot per shape', () => {
    const layout = computeLayout({ width: 390, height: 844, safeTop: 0, safeBottom: 0, gridSize: 6, shapeCount: 6 });
    assert.equal(layout.tray.slots.length, 6);
    assert.deepEqual(layout.tray.slots.map((slot) => slot.shape), [0, 1, 2, 3, 4, 5]);

    const step = layout.tray.slots[1].cx - layout.tray.slots[0].cx;
    for (let i = 1; i < layout.tray.slots.length; i++) {
        assert.ok(
            Math.abs(layout.tray.slots[i].cx - layout.tray.slots[i - 1].cx - step) < 0.01,
            'slots are evenly spaced',
        );
    }
    for (const slot of layout.tray.slots) assert.ok(slot.radius > 0, 'every slot has a visible shape');
});

test('taps on cells map back to the exact row and column', () => {
    for (const input of VIEWPORTS) {
        const layout = computeLayout(input);
        const { x, y, cell } = layout.board;

        for (let row = 0; row < input.gridSize; row++) {
            for (let col = 0; col < input.gridSize; col++) {
                const hit = hitTest(layout, x + col * cell + cell / 2, y + row * cell + cell / 2);
                assert.deepEqual(
                    hit,
                    { kind: 'selectCell', row, col },
                    `cell ${row},${col} misread at ${describe(input)}`,
                );
            }
        }
    }
});

test('taps on tray slots map back to the right shape', () => {
    for (const input of VIEWPORTS) {
        const layout = computeLayout(input);
        for (const slot of layout.tray.slots) {
            assert.deepEqual(
                hitTest(layout, slot.cx, slot.cy),
                { kind: 'pickShape', shape: slot.shape },
                `slot ${slot.shape} misread at ${describe(input)}`,
            );
        }
    }
});

test('taps outside the board and the tray mean nothing', () => {
    const layout = computeLayout({ width: 390, height: 844, safeTop: 44, safeBottom: 0, gridSize: 4, shapeCount: 4 });

    assert.equal(hitTest(layout, 0, 0), null, 'above the board');
    assert.equal(hitTest(layout, 5, layout.hud.y + 5), null, 'on the HUD');
    assert.equal(hitTest(layout, 1, layout.board.y + 5), null, 'just left of the board');
    assert.equal(hitTest(layout, layout.board.x - 1, layout.board.y + 10), null, 'in the frame margin');
    assert.equal(hitTest(layout, 5, 844), null, 'unused corner');
});

test('the whole tray band stays tappable, not just the artwork', () => {
    const layout = computeLayout({ width: 390, height: 844, safeTop: 0, safeBottom: 0, gridSize: 4, shapeCount: 4 });
    // A finger landing above the shape but still inside the tray should still pick one.
    const slot = layout.tray.slots[0];
    assert.ok(hitTest(layout, slot.cx, layout.tray.y + 2) !== null, 'top edge of the tray band');
    assert.ok(hitTest(layout, slot.cx, layout.tray.y + layout.tray.height - 2) !== null, 'bottom edge of the tray band');
});
