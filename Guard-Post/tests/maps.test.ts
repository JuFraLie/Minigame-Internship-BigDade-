import test from 'node:test';
import assert from 'node:assert/strict';

import { generateMap } from '../src/domain/mapGenerator.ts';
import {
    GRID_HEIGHT,
    GRID_WIDTH,
    MAPS,
    distanceToRoad,
    fitsBesideGateCastle,
    measureRoad,
    pointOnRoad,
    type GameMap,
} from '../src/domain/maps.ts';

/**
 * Map layouts — reference and generated — against the design document's map rules:
 * one road of 28–36 tiles that enters on an edge and ends at a gate in the bottom
 * row, 6–8 build spots each 1–2 tiles from the road and each centred on a grid cell,
 * so its square pad fills exactly one cell of the field, none hiding under the gate
 * castle; everything inside the 9 x 12 grid, and every level a fresh layout.
 */

/** Every spot must sit 1–2 tiles off the road; small epsilon for authored decimals. */
const MIN_SPOT_DISTANCE = 1 - 1e-6;
const MAX_SPOT_DISTANCE = 2 + 1e-6;

/** The road and spot rules, for any layout — reference or generated. */
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

test('every level is a freshly generated layout', () => {
    const roads = new Set<string>();
    for (let level = 1; level <= 40; level++) {
        const map = generateMap(level);
        assert.equal(map.name, `Level ${level}`, `level ${level} fell back to a reference map`);
        assert.equal(map.theme, (level - 1) % 3, `level ${level} theme`);
        const signature = JSON.stringify(map.waypoints);
        assert.ok(!roads.has(signature), `level ${level} repeats an earlier road`);
        roads.add(signature);
        assert.deepEqual(generateMap(level), map, `level ${level} must be reproducible`);
    }
});

test('generated layouts obey the road and spot rules', () => {
    for (let level = 1; level <= 24; level++) {
        assertMapRules(generateMap(level), `level ${level}`);
    }
});

test('a generated map measures its road consistently', () => {
    assertRoadSampling(generateMap(7), 'level 7');
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
