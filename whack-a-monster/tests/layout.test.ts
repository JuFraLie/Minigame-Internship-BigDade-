import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_HEIGHT, FIELD_WIDTH, HOLE_COUNT, holePosition } from '../src/core/config.ts';
import {
    HUD_HEIGHT,
    computeLayout,
    fieldToScreen,
    screenToField,
    topPadding,
} from '../src/rendering/layout.ts';

/** Portrait phone, and the awkward shapes a real device pool throws at us. */
const viewports = [
    { name: 'tall phone', width: 360, height: 800, safeTop: 0 },
    { name: 'cutout phone', width: 393, height: 852, safeTop: 59 },
    { name: 'short phone', width: 320, height: 568, safeTop: 20 },
    { name: 'square-ish window', width: 700, height: 800, safeTop: 0 },
];

test('screen and field coordinates round-trip exactly', () => {
    for (const viewport of viewports) {
        const layout = computeLayout(viewport);

        for (let hole = 0; hole < HOLE_COUNT; hole++) {
            const field = holePosition(hole);
            const screen = fieldToScreen(layout, field);
            const back = screenToField(layout, screen);

            assert.ok(Math.abs(back.x - field.x) < 1e-9, `${viewport.name}: x round trip`);
            assert.ok(Math.abs(back.y - field.y) < 1e-9, `${viewport.name}: y round trip`);
        }
    }
});

test('the field always sits below the cutout and the HUD', () => {
    for (const viewport of viewports) {
        const layout = computeLayout(viewport);
        const expectedTop = topPadding(viewport) + HUD_HEIGHT;

        assert.ok(
            layout.field.y >= expectedTop - 1e-9,
            `${viewport.name}: field starts at ${layout.field.y}, expected >= ${expectedTop}`,
        );
    }
});

test('the field never overflows the screen, whatever the aspect ratio', () => {
    for (const viewport of viewports) {
        const layout = computeLayout(viewport);
        const right = layout.field.x + FIELD_WIDTH * layout.field.scale;
        const bottom = layout.field.y + FIELD_HEIGHT * layout.field.scale;

        assert.ok(layout.field.x >= -1e-9, `${viewport.name}: no left overflow`);
        assert.ok(right <= viewport.width + 1e-9, `${viewport.name}: no right overflow`);
        assert.ok(bottom <= viewport.height + 1e-9, `${viewport.name}: no bottom overflow`);
    }
});

test('top padding covers both the cutout and a floor percentage', () => {
    assert.equal(topPadding({ width: 400, height: 800, safeTop: 0 }), 40, '5% of the height');
    assert.equal(topPadding({ width: 400, height: 800, safeTop: 60 }), 60, 'the cutout wins');
    assert.equal(topPadding({ width: 400, height: 1000, safeTop: 10 }), 50, 'the floor wins');
});

test('the mapping keeps a uniform scale, so nothing is stretched', () => {
    for (const viewport of viewports) {
        const layout = computeLayout(viewport);
        const width = FIELD_WIDTH * layout.field.scale;
        const height = FIELD_HEIGHT * layout.field.scale;
        const ratio = width / height;

        assert.ok(
            Math.abs(ratio - FIELD_WIDTH / FIELD_HEIGHT) < 1e-9,
            `${viewport.name}: aspect preserved (${ratio})`,
        );
    }
});
