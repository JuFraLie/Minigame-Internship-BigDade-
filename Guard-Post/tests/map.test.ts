import test from 'node:test';
import assert from 'node:assert/strict';

import { FixedMapSource } from '../src/adapters/maps/FixedMapSource.ts';
import { ProceduralMapSource } from '../src/adapters/maps/ProceduralMapSource.ts';
import { FALLBACK_MAP, generateMap } from '../src/domain/map/generateMap.ts';
import { DEFAULT_MAP_PARAMS, type MapDefinition, type MapParams, type MapSource } from '../src/domain/map/types.ts';
import { roadCells, validateMap } from '../src/domain/map/validate.ts';
import { asciiMap } from '../src/testing/asciiMap.ts';

/**
 * The generator's contract: deterministic from its params, legal for a thousand
 * seeds, fast enough to run at level start, and never throwing — with the hand-authored
 * fixed map as the escape hatch when the parameters make a legal road impossible.
 */

/** Default parameters with overrides, so each test states only what it cares about. */
function params(overrides: Partial<MapParams> = {}): MapParams {
    return { ...DEFAULT_MAP_PARAMS, ...overrides };
}

test('the same parameters always produce the same map', () => {
    const first = generateMap(params({ seed: 42 }));
    const second = generateMap(params({ seed: 42 }));
    assert.deepEqual(second, first);

    // ...and different seeds almost always produce different roads.
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
        signatures.add(JSON.stringify(generateMap(params({ seed })).waypoints));
    }
    assert.ok(signatures.size >= 4, `only ${signatures.size} of 5 seeds differed`);
});

test('every seed from 0 to 999 produces a fully validated map', () => {
    for (let seed = 0; seed < 1000; seed++) {
        const map = generateMap(params({ seed }));
        const problems = validateMap(map, params({ seed }));
        assert.deepEqual(problems, [], `seed ${seed}: ${problems.join('; ')}`);
    }
});

test('every pad hugs the road within 1.5 tiles — even beside the gate castle', () => {
    // The player's rule: a level-1 tower on any pad must reach the enemy standing
    // next to it. Grid distances are 1, sqrt(2), 2 … so 1.5 tiles means "touching
    // the road", and the gate castle gets no push-out exception — its footprint only
    // pushes the pads for the final approach up into the row above its battlements.
    for (let seed = 0; seed < 100; seed++) {
        const map = generateMap(params({ seed }));
        const cells = roadCells(map.waypoints, map.width, map.height);
        for (const spot of map.spots) {
            let nearest = Number.POSITIVE_INFINITY;
            for (const cell of cells) {
                const distance = Math.hypot(spot.x - (cell.x + 0.5), spot.y - (cell.y + 0.5));
                if (distance < nearest) nearest = distance;
            }
            assert.ok(
                nearest <= 1.5 + 1e-6,
                `seed ${seed}: pad (${spot.x}, ${spot.y}) sits ${nearest.toFixed(3)} tiles from the road`,
            );
        }
    }
});

test('impossible parameters fall back to the fixed map without throwing', () => {
    // A road of 500+ tiles cannot exist on a 9 x 12 grid: every attempt must fail.
    const map = generateMap(params({ seed: 7, minLength: 500, maxLength: 600 }));
    assert.deepEqual(map, FALLBACK_MAP, 'the fallback is the first FixedMapSource map');
    assert.deepEqual(map, new FixedMapSource().getMap(1));

    // The fixed map keeps the round playable: shape, ids and cell-centred pads.
    assert.ok(map.waypoints.length >= 2);
    assert.equal(map.pathLength, 28);
    assert.equal(map.spots.length, 6);
    for (const [i, spot] of map.spots.entries()) {
        assert.equal(spot.id, `s${i}`);
        assert.equal(spot.x - Math.floor(spot.x), 0.5, `spot ${i} x`);
        assert.equal(spot.y - Math.floor(spot.y), 0.5, `spot ${i} y`);
    }
    // It is not just shaped like a map: the escape hatch obeys every rule itself,
    // so a fallback round is still fully coverable.
    assert.deepEqual(
        validateMap(map, { ...DEFAULT_MAP_PARAMS, spotCount: map.spots.length }),
        [],
        'the fallback itself obeys every map rule',
    );
});

test('1000 maps generate well inside the 50 ms per-map budget', () => {
    let slowest = 0;
    let totalMs = 0;
    let reMeasured = 0;
    for (let seed = 0; seed < 1000; seed++) {
        const started = performance.now();
        generateMap(params({ seed }));
        let elapsed = performance.now() - started;
        if (elapsed > 50) {
            // Generation is deterministic, so a single slow reading on a shared
            // machine is the process being stalled, not the map: re-measure and keep
            // the better of the two. A map that is genuinely over budget fails again.
            const retryStarted = performance.now();
            generateMap(params({ seed }));
            elapsed = Math.min(elapsed, performance.now() - retryStarted);
            reMeasured++;
        }
        totalMs += elapsed;
        if (elapsed > slowest) slowest = elapsed;
    }
    console.log(
        `  map generation: ${(totalMs / 1000).toFixed(3)} ms/map average, slowest ${slowest.toFixed(3)} ms` +
            (reMeasured > 0 ? `, ${reMeasured} stalled reading(s) re-measured` : ''),
    );
    assert.ok(slowest < 50, `the slowest map took ${slowest.toFixed(3)} ms, budget is 50 ms`);
});

test('the shortest and longest allowed roads both validate', () => {
    // The exact minimum is easy: every seed must manage it.
    const shortestParams = params({ seed: 11, minLength: 28, maxLength: 28 });
    const shortest = generateMap(shortestParams);
    assert.equal(shortest.pathLength, 28, 'the smallest allowed length');
    assert.deepEqual(validateMap(shortest, shortestParams), []);

    // The exact maximum is rare — the search must land on a full-length path — so the
    // top of the range is asserted as a rate across seeds: plenty of seeds reach 36
    // tiles, and any map that claims to really has them.
    let reachedMaximum = 0;
    for (let seed = 0; seed < 50; seed++) {
        const longestParams = params({ seed, minLength: 36, maxLength: 36 });
        const map = generateMap(longestParams);
        if (validateMap(map, longestParams).length === 0) {
            assert.equal(map.pathLength, 36, `seed ${seed}: the largest allowed length`);
            reachedMaximum++;
        }
    }
    assert.ok(reachedMaximum >= 10, `only ${reachedMaximum}/50 seeds reached the 36-tile maximum`);
});

test('spotCount honours both ends of its allowed range', () => {
    // Six pads cover a road only for the denser shapes, so — like the exact maximum
    // length — the low end is asserted as a rate across seeds: plenty of seeds come
    // back with a generated map carrying exactly six pads, and every one that does
    // validates.
    let sixPads = 0;
    for (let seed = 0; seed < 50; seed++) {
        const fewParams = params({ seed, spotCount: 6 });
        const map = generateMap(fewParams);
        if (map !== FALLBACK_MAP) {
            assert.equal(map.spots.length, 6, `seed ${seed}: exactly six pads`);
            assert.deepEqual(validateMap(map, fewParams), [], `seed ${seed}`);
            sixPads++;
        }
    }
    assert.ok(sixPads >= 6, `only ${sixPads}/50 seeds produced a six-pad map`);

    const manyParams = params({ seed: 22, spotCount: 8 });
    const many = generateMap(manyParams);
    assert.equal(many.spots.length, 8);
    assert.deepEqual(validateMap(many, manyParams), []);
});

/** The contract every `MapSource` must honour: shape and reproducibility. */
function assertMapSourceContract(name: string, source: MapSource): void {
    const map = source.getMap(1);
    assert.deepEqual(source.getMap(1), map, `${name}: getMap must be deterministic`);

    assert.equal(typeof map.seed, 'number', `${name}: seed`);
    assert.ok(map.width > 0 && map.height > 0, `${name}: grid size`);
    assert.ok(Number.isFinite(map.pathLength) && map.pathLength >= 1, `${name}: pathLength`);
    assert.ok(map.waypoints.length >= 2, `${name}: waypoints`);
    for (const point of map.waypoints) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${name}: waypoint numbers`);
    }
    assert.ok(map.spots.length >= 1, `${name}: spots`);
    for (const [i, spot] of map.spots.entries()) {
        assert.equal(spot.id, `s${i}`, `${name}: spot ids run s0..sn-1 in pick order`);
    }
}

test('ProceduralMapSource honours the MapSource contract', () => {
    assertMapSourceContract('procedural', new ProceduralMapSource(0));
});

test('FixedMapSource honours the MapSource contract', () => {
    assertMapSourceContract('fixed', new FixedMapSource());
});

test('the ASCII dump renders road, spots and empty ground', () => {
    const map: MapDefinition = generateMap(params({ seed: 5 }));
    const dump = asciiMap(map);
    const rows = dump.split('\n');

    assert.equal(rows.length, map.height, 'one line per row');
    for (const row of rows) {
        assert.equal(row.split(' ').length, map.width, 'one cell per column');
    }
    assert.ok(dump.includes('#'), 'the road shows up');
    assert.ok(dump.includes('S'), 'the spots show up');
    assert.ok(dump.includes('.'), 'empty ground shows up');
});
