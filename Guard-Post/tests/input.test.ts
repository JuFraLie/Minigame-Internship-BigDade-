import test from 'node:test';
import assert from 'node:assert/strict';

import { pickAction, pickHalfSide, type PlayContext } from '../src/adapters/phaser/inputAdapter.ts';
import { computePlayLayout } from '../src/adapters/phaser/layout.ts';
import { createViewTransform } from '../src/adapters/phaser/viewTransform.ts';
import { MAPS } from '../src/domain/maps.ts';
import { TOWER_SPECS, TOWER_TYPES, type TowerView } from '../src/domain/types.ts';

/**
 * The input adapter: the only place a screen pixel becomes a command.
 *
 * Everything downstream speaks world coordinates and ids (AGENTS.md §4.3), so these
 * tests drive `pickAction` raw — a design-space tap in, a `PlayAction` out — with no
 * Phaser, no scene and no game running.
 */

const SPOTS = MAPS[0].spots;

const layout = computePlayLayout({ width: 390, height: 844, safeTop: 47, safeBottom: 34, spots: SPOTS });
const transform = createViewTransform(layout.board);

function context(overrides: Partial<PlayContext> = {}): PlayContext {
    return {
        layout,
        transform,
        spots: SPOTS,
        towers: [],
        selection: null,
        canCallWave: true,
        paused: false,
        ...overrides,
    };
}

function centerOf(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function towerAt(spotId: number, overrides: Partial<TowerView> = {}): TowerView {
    const spot = SPOTS[spotId];
    return {
        id: 7,
        spotId,
        type: 'dart',
        level: 1,
        x: spot.x,
        y: spot.y,
        range: TOWER_SPECS.dart.range,
        damage: TOWER_SPECS.dart.damage,
        cooldown: 0,
        spent: TOWER_SPECS.dart.cost,
        ...overrides,
    };
}

test('a tap on the pause button pauses, and nothing else does', () => {
    const pause = centerOf(layout.hud.pause);
    assert.deepEqual(pickAction(context(), pause.x, pause.y), { kind: 'pause' });

    // Off-target taps mean nothing.
    assert.equal(pickAction(context(), layout.hud.round.x + 4, layout.hud.round.y + 4), null);
});

test('while paused, the only answer is Resume — no pause, no commands, no exit', () => {
    const paused = context({ paused: true });

    const resume = centerOf(layout.resume);
    assert.deepEqual(pickAction(paused, resume.x, resume.y), { kind: 'resume' });

    // The pause button itself is dead while paused: pause must not toggle anything.
    const pause = centerOf(layout.hud.pause);
    assert.equal(pickAction(paused, pause.x, pause.y), null);

    // A tap on the board or the menus changes nothing either.
    const boardCentre = centerOf(layout.board);
    assert.equal(pickAction(paused, boardCentre.x, boardCentre.y), null);
    const build = centerOf(layout.menu.buildButtons[0]);
    assert.equal(pickAction(paused, build.x, build.y), null);
});

test('the Call wave button only answers while a wave can be called', () => {
    const point = centerOf(layout.callWave);
    assert.deepEqual(pickAction(context({ canCallWave: true }), point.x, point.y), { kind: 'callWave' });
    assert.equal(pickAction(context({ canCallWave: false }), point.x, point.y), null);
});

test('a tap on a spot selects it, in world coordinates the logic can own', () => {
    for (const [spotId, spot] of SPOTS.entries()) {
        const action = pickAction(context(), transform.toScreenX(spot.x), transform.toScreenY(spot.y));
        assert.deepEqual(action, { kind: 'selectSpot', spotId }, `spot ${spotId}`);
    }
});

test('the tap target is the square pad: its corners count, just past its edge does not', () => {
    const half = pickHalfSide(layout.board.tile);
    const spot = SPOTS[0];

    // Inside the box near a corner — outside the box by distance, inside by the rules.
    const corner = { x: spot.x + half * 0.95, y: spot.y + half * 0.95 };
    assert.deepEqual(
        pickAction(context(), transform.toScreenX(corner.x), transform.toScreenY(corner.y)),
        { kind: 'selectSpot', spotId: 0 },
    );

    // Just beyond the box: the board, but no pad under the finger.
    const outside = { x: spot.x + half * 1.1, y: spot.y + half * 1.1 };
    assert.deepEqual(
        pickAction(context(), transform.toScreenX(outside.x), transform.toScreenY(outside.y)),
        { kind: 'clearSelection' },
    );
});

test('the three build buttons map to dart, cannon and frost, in order', () => {
    const selected = context({ selection: { kind: 'spot', spotId: 0 } });
    layout.menu.buildButtons.forEach((rect, index) => {
        const point = centerOf(rect);
        assert.deepEqual(pickAction(selected, point.x, point.y), { kind: 'build', tower: TOWER_TYPES[index] });
    });
});

test('upgrade and sell are the two answers to a selected tower', () => {
    const tower = towerAt(2);
    const selected = context({ selection: { kind: 'tower', towerId: tower.id }, towers: [tower] });

    const [upgrade, sell] = layout.menu.towerButtons;
    assert.ok(upgrade && sell);
    assert.deepEqual(pickAction(selected, ...point(upgrade)), { kind: 'upgrade' });
    assert.deepEqual(pickAction(selected, ...point(sell)), { kind: 'sell' });
});

test('a tower wins the shared tap over the spot it stands on', () => {
    const tower = towerAt(2);
    const point = { x: transform.toScreenX(tower.x), y: transform.toScreenY(tower.y) };
    const action = pickAction(context({ towers: [tower] }), point.x, point.y);
    assert.deepEqual(action, { kind: 'selectTower', towerId: tower.id });
});

test('tapping the menu background is dead space; the empty board clears the selection', () => {
    const selected = context({ selection: { kind: 'spot', spotId: 0 } });

    // Inside the panel, above its buttons: nothing happens.
    const panel = layout.menu.panel;
    assert.equal(pickAction(selected, panel.x + panel.width / 2, panel.y + 12), null);

    // On the board but on no spot: the menu closes.
    const board = layout.board;
    const corner = { x: board.x + 2, y: board.y + 2 };
    assert.deepEqual(pickAction(selected, corner.x, corner.y), { kind: 'clearSelection' });
});

test('taps outside the board and its chrome mean nothing', () => {
    assert.equal(pickAction(context(), 1, 1), null);
    assert.equal(pickAction(context(), layout.width - 2, 4), null);
});

test('the view transform converts screen to world and back without drift', () => {
    for (const world of [
        { x: 0, y: 0 },
        { x: 4.5, y: 6 },
        { x: 8.9, y: 11.9 },
    ]) {
        const screenX = transform.toScreenX(world.x);
        const screenY = transform.toScreenY(world.y);
        assert.ok(Math.abs(transform.toWorldX(screenX) - world.x) < 1e-9);
        assert.ok(Math.abs(transform.toWorldY(screenY) - world.y) < 1e-9);
    }
});

/** The centre of a rect, spread so it can be passed straight into `pickAction`. */
function point(rect: { x: number; y: number; width: number; height: number }): [number, number] {
    const centre = centerOf(rect);
    return [centre.x, centre.y];
}
