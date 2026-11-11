import test from 'node:test';
import assert from 'node:assert/strict';

import {
    GRID_HEIGHT,
    GRID_WIDTH,
    MAPS,
    distanceToRoad,
    mapForLevel,
    measureRoad,
    pointOnRoad,
} from '../src/domain/maps.ts';

/**
 * The three maps, against the design document's map rules: one road of 28–36 tiles,
 * 6–8 build spots each 1–2 tiles from the road, everything inside the 9 x 12 grid, and
 * a level rotation that never repeats a layout for three levels in a row.
 */

/** Every spot must sit 1–2 tiles off the road; small epsilon for authored decimals. */
const MIN_SPOT_DISTANCE = 1 - 1e-6;
const MAX_SPOT_DISTANCE = 2 + 1e-6;

test('there are three maps, rotating across levels', () => {
    assert.equal(MAPS.length, 3);
    assert.equal(mapForLevel(1), MAPS[0]);
    assert.equal(mapForLevel(2), MAPS[1]);
    assert.equal(mapForLevel(3), MAPS[2]);
    assert.equal(mapForLevel(4), MAPS[0]);
    assert.equal(mapForLevel(5), MAPS[1]);
    assert.equal(mapForLevel(6), MAPS[2]);
    assert.equal(mapForLevel(7), MAPS[0]);
});

for (const map of MAPS) {
    test(`map "${map.name}" obeys the road and spot rules`, () => {
        const road = measureRoad(map);

        // Road length: 28–36 tiles.
        assert.ok(road.total >= 28 && road.total <= 36, `road is ${road.total} tiles`);
        assert.equal(road.lengths.length, map.waypoints.length - 1);

        // The path enters and leaves the grid, and never crosses it uninvolved.
        assert.ok(map.waypoints.length >= 2);
        for (const point of map.waypoints) {
            assert.ok(point.x >= 0 && point.x <= GRID_WIDTH, `waypoint x ${point.x}`);
            assert.ok(point.y >= 0 && point.y <= GRID_HEIGHT, `waypoint y ${point.y}`);
        }
        const first = map.waypoints[0];
        const last = map.waypoints[map.waypoints.length - 1];
        assert.ok(Math.hypot(last.x - first.x, last.y - first.y) > 1, 'the gate is not the entrance');

        // 6–8 build spots, inside the grid, all distinct.
        assert.ok(map.spots.length >= 6 && map.spots.length <= 8, `${map.spots.length} spots`);
        for (const [i, spot] of map.spots.entries()) {
            assert.ok(spot.x >= 0 && spot.x <= GRID_WIDTH, `spot ${i} x ${spot.x}`);
            assert.ok(spot.y >= 0 && spot.y <= GRID_HEIGHT, `spot ${i} y ${spot.y}`);
            for (const other of map.spots.slice(i + 1)) {
                assert.ok(Math.hypot(spot.x - other.x, spot.y - other.y) > 0.5, 'spots must not overlap');
            }

            // 1–2 tiles from the road — never on it, never out of tower reach.
            const distance = distanceToRoad(map, road, spot);
            assert.ok(
                distance >= MIN_SPOT_DISTANCE && distance <= MAX_SPOT_DISTANCE,
                `spot ${i} at (${spot.x}, ${spot.y}) is ${distance.toFixed(3)} tiles from the road`,
            );
        }
    });

    test(`map "${map.name}" measures its road consistently`, () => {
        const road = measureRoad(map);
        const point = { x: 0, y: 0 };

        pointOnRoad(map, road, 0, point);
        assert.equal(point.x, map.waypoints[0].x);
        assert.equal(point.y, map.waypoints[0].y);

        // A point on the road is, by definition, on the road.
        const mid = road.total * 0.5;
        pointOnRoad(map, road, mid, point);
        assert.ok(distanceToRoad(map, road, point) < 1e-9);

        // Distances past the end clamp to the gate.
        pointOnRoad(map, road, road.total + 100, point);
        const last = map.waypoints[map.waypoints.length - 1];
        assert.equal(point.x, last.x);
        assert.equal(point.y, last.y);

        // Sampling the road walks forward continuously: between two samples the point
        // never moves further than the sample gap, and every sample lies on the road.
        const stepDistance = road.total / 20;
        let previous = { x: map.waypoints[0].x, y: map.waypoints[0].y };
        for (let step = 1; step <= 20; step++) {
            pointOnRoad(map, road, stepDistance * step, point);
            const jump = Math.hypot(point.x - previous.x, point.y - previous.y);
            assert.ok(jump <= stepDistance + 1e-9, `step ${step} jumped ${jump} > ${stepDistance}`);
            assert.ok(distanceToRoad(map, road, point) < 1e-9, `step ${step} is off the road`);
            previous = { x: point.x, y: point.y };
        }
    });
}
