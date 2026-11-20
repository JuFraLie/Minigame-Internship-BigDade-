import test from 'node:test';
import assert from 'node:assert/strict';

import { ProceduralMapSource } from '../src/adapters/maps/ProceduralMapSource.ts';
import { Simulation } from '../src/domain/simulation.ts';
import {
    GRID_HEIGHT,
    GRID_WIDTH,
    MAPS,
    distanceToRoad,
    fitsBesideGateCastle,
    isInsideGateCastle,
    measureRoad,
    pointOnRoad,
    type GameMap,
} from '../src/domain/maps.ts';
import { DEFAULT_MAP_PARAMS, type MapDefinition } from '../src/domain/map/types.ts';
import { validateMap } from '../src/domain/map/validate.ts';

/**
 * Map layouts — reference and generated — against the design document's map rules:
 * one road of 28–36 tiles that enters at the left edge and ends at a gate in the
 * bottom row, 6–8 build spots each 1–2 tiles from the road and each centred on a
 * grid cell, so its square pad fills exactly one cell of the field, none hiding under
 * the gate castle; everything inside the 9 x 12 grid, and every level a fresh layout.
 *
 * Generated maps are checked through `validateMap`, which encodes these rules in
 * their stricter generated form — pads hugging the road at 1.5 tiles with no
 * exception, not even beside the gate castle, and coverage by the shortest level-1
 * tower range (the gate tile alone excepted, as it stands inside the castle).
 */

/** Every spot must sit 1–2 tiles off the road; small epsilon for authored decimals. */
const MIN_SPOT_DISTANCE = 1 - 1e-6;
const MAX_SPOT_DISTANCE = 2 + 1e-6;

/** The road and spot rules, for an authored layout. */
function assertMapRules(map: GameMap, label: string): void {
    const road = measureRoad(map);

    // Road length: 28–36 tiles.
    assert.ok(road.total >= 28 && road.total <= 36, `${label}: road is ${road.total} tiles`);
    assert.equal(road.lengths.length, map.waypoints.length - 1, label);

    // The path enters and leaves the grid, and never crosses it uninvolved.
    assert.ok(map.waypoints.length >= 2, label);
    for (const point of map.waypoints) {
        assert.ok(point.x >= 0 && point.x <= GRID_WIDTH, `${label}: waypoint x ${point.x}`);
        assert.ok(point.y >= 0 && point.y <= GRID_HEIGHT, `${label}: waypoint y ${point.y}`);
    }
    // Segments stay axis-aligned: enemies never cut a corner diagonally.
    for (let i = 1; i < map.waypoints.length; i++) {
        const a = map.waypoints[i - 1];
        const b = map.waypoints[i];
        assert.ok(a.x === b.x || a.y === b.y, `${label}: segment ${i} is diagonal`);
    }
    const first = map.waypoints[0];
    const last = map.waypoints[map.waypoints.length - 1];
    assert.ok(Math.hypot(last.x - first.x, last.y - first.y) > 1, `${label}: the gate is not the entrance`);

    // 6–8 build spots, inside the grid, on cell centres, all distinct.
    assert.ok(map.spots.length >= 6 && map.spots.length <= 8, `${label}: ${map.spots.length} spots`);
    for (const [i, spot] of map.spots.entries()) {
        assert.ok(spot.x >= 0 && spot.x <= GRID_WIDTH, `${label}: spot ${i} x ${spot.x}`);
        assert.ok(spot.y >= 0 && spot.y <= GRID_HEIGHT, `${label}: spot ${i} y ${spot.y}`);
        // Cell centre: the square pad sits inside exactly one grid cell.
        assert.equal(spot.x - Math.floor(spot.x), 0.5, `${label}: spot ${i} x ${spot.x} is not a cell centre`);
        assert.equal(spot.y - Math.floor(spot.y), 0.5, `${label}: spot ${i} y ${spot.y} is not a cell centre`);
        for (const other of map.spots.slice(i + 1)) {
            assert.ok(Math.hypot(spot.x - other.x, spot.y - other.y) > 0.5, `${label}: spots must not overlap`);
        }

        // 1–2 tiles from the road — never on it, never out of tower reach.
        const distance = distanceToRoad(map, road, spot);
        assert.ok(
            distance >= MIN_SPOT_DISTANCE && distance <= MAX_SPOT_DISTANCE,
            `${label}: spot ${i} at (${spot.x}, ${spot.y}) is ${distance.toFixed(3)} tiles from the road`,
        );

        // Never under the gate castle: the renderer draws the castle over the pad.
        assert.ok(fitsBesideGateCastle(spot, last), `${label}: spot ${i} hides under the gate castle`);
    }
}

/** `pointOnRoad` walks the polyline continuously and clamps past either end. */
function assertRoadSampling(map: GameMap, label: string): void {
    const road = measureRoad(map);
    const point = { x: 0, y: 0 };

    pointOnRoad(map, road, 0, point);
    assert.equal(point.x, map.waypoints[0].x, label);
    assert.equal(point.y, map.waypoints[0].y, label);

    // A point on the road is, by definition, on the road.
    const mid = road.total * 0.5;
    pointOnRoad(map, road, mid, point);
    assert.ok(distanceToRoad(map, road, point) < 1e-9, label);

    // Distances past the end clamp to the gate.
    pointOnRoad(map, road, road.total + 100, point);
    const last = map.waypoints[map.waypoints.length - 1];
    assert.equal(point.x, last.x, label);
    assert.equal(point.y, last.y, label);

    // Sampling the road walks forward continuously: between two samples the point
    // never moves further than the sample gap, and every sample lies on the road.
    const stepDistance = road.total / 20;
    let previous = { x: map.waypoints[0].x, y: map.waypoints[0].y };
    for (let step = 1; step <= 20; step++) {
        pointOnRoad(map, road, stepDistance * step, point);
        const jump = Math.hypot(point.x - previous.x, point.y - previous.y);
        assert.ok(jump <= stepDistance + 1e-9, `${label}: step ${step} jumped ${jump} > ${stepDistance}`);
        assert.ok(distanceToRoad(map, road, point) < 1e-9, `${label}: step ${step} is off the road`);
        previous = { x: point.x, y: point.y };
    }
}

/** A definition in the shape the road-sampling helpers expect. */
function asGameMap(definition: MapDefinition): GameMap {
    return {
        name: `Level ${definition.seed}`,
        theme: 0,
        waypoints: definition.waypoints,
        spots: definition.spots.map((spot) => ({ x: spot.x, y: spot.y })),
    };
}

test('every level is a freshly generated layout', () => {
    const source = new ProceduralMapSource(0);
    const layouts = new Set<string>();
    for (let level = 1; level <= 40; level++) {
        const definition = source.getMap(level);
        // Empty violations also prove the round never fell back to the fixed map.
        assert.deepEqual(validateMap(definition, DEFAULT_MAP_PARAMS), [], `level ${level} broke a map rule`);
        // The full layout must be fresh. Road shapes alone may legitimately repeat —
        // the walk's shape space is finite and each level is generated statelessly —
        // but the pads are drawn per level, so no two levels play identically.
        const signature = JSON.stringify({ waypoints: definition.waypoints, spots: definition.spots });
        assert.ok(!layouts.has(signature), `level ${level} repeats an earlier layout`);
        layouts.add(signature);
        assert.deepEqual(source.getMap(level), definition, `level ${level} must be reproducible`);

        // The round adapts the definition for the renderer: name seeds scenery,
        // theme picks the grass and castle.
        const map = new Simulation(level, source).map;
        assert.equal(map.name, `Level ${level}`, `level ${level} name`);
        assert.equal(map.theme, (level - 1) % 3, `level ${level} theme`);
    }
});

test('a fresh session salt reshuffles the layouts', () => {
    // Every launch passes a new salt, so returning players start on new roads even
    // at the same level number — the fix for "the first level is fixed".
    const first = new ProceduralMapSource(0);
    const second = new ProceduralMapSource(1);
    const third = new ProceduralMapSource(0xdeadbeef);
    for (const level of [1, 12, 27, 40]) {
        const base = JSON.stringify(first.getMap(level).waypoints);
        assert.notEqual(JSON.stringify(second.getMap(level).waypoints), base, `level ${level} with salt 1`);
        assert.notEqual(JSON.stringify(third.getMap(level).waypoints), base, `level ${level} with salt 0xdeadbeef`);
    }
});

test('generated layouts obey the road and spot rules', () => {
    const source = new ProceduralMapSource(0);
    for (let level = 1; level <= 24; level++) {
        const definition = source.getMap(level);
        assert.deepEqual(
            validateMap(definition, DEFAULT_MAP_PARAMS),
            [],
            `level ${level}: ${validateMap(definition, DEFAULT_MAP_PARAMS).join('; ')}`,
        );
    }
});

test('a generated map measures its road consistently', () => {
    const source = new ProceduralMapSource(0);
    for (const level of [1, 7, 13]) {
        assertRoadSampling(asGameMap(source.getMap(level)), `level ${level}`);
    }
});

for (const map of MAPS) {
    test(`reference map "${map.name}" obeys the road and spot rules`, () => {
        assertMapRules(map, map.name);
        assert.equal(MAPS.indexOf(map), map.theme, 'reference map theme');
    });

    test(`reference map "${map.name}" measures its road consistently`, () => {
        assertRoadSampling(map, map.name);
    });
}

test('the castle touch box sits inside the board and follows the gate art', () => {
    const gate = MAPS[0].waypoints[MAPS[0].waypoints.length - 1];

    assert.ok(isInsideGateCastle(gate, gate), 'the gate point itself is inside the castle');
    assert.ok(isInsideGateCastle({ x: gate.x, y: gate.y - 1.9 }, gate), 'the battlement edge');
    assert.ok(!isInsideGateCastle({ x: gate.x, y: gate.y - 1.91 }, gate), 'not one step earlier');
    assert.ok(!isInsideGateCastle({ x: gate.x + 1.51, y: gate.y }, gate), 'outside the side walls');
    assert.ok(!isInsideGateCastle({ x: gate.x, y: gate.y + 0.33 }, gate), 'past the front step');
    assert.ok(gate.y - 1.9 >= 0 && gate.y + 0.32 <= GRID_HEIGHT, 'the box stays on the board');
});
