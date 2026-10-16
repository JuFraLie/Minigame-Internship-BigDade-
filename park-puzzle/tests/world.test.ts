import assert from 'node:assert/strict';
import test from 'node:test';

import { GameWorld } from '../src/core/world.ts';
import type { CarSpec } from '../src/core/world.ts';
import { entryCellIndex } from '../src/core/ring.ts';
import { TICK_SECONDS } from '../src/core/config.ts';

import { seededRandom } from './helpers.ts';

/** Level 1: a 4x4 lot, length-2 cars, 2.5 cells/s, no bus. */
const LEVEL = 1;

function worldWith(cars: readonly CarSpec[]): GameWorld {
    const world = new GameWorld(seededRandom(1), LEVEL);
    world.load(cars);
    return world;
}

/**
 * A car parked somewhere nobody taps it.
 *
 * It keeps the lot non-empty, so the round does not end and pay the clear bonus on top of
 * what the test is actually measuring.
 */
const DECOY: CarSpec = { col: 0, row: 0, dir: 'up', length: 2, color: 0x9b59b6 };

/**
 * Ticks until `done` holds, or gives up after `limit` simulated seconds.
 *
 * Polling beats sleeping for a fixed time here: a car's arrival depends on the tick
 * rounding, and a test that hard-codes the duration would drift with the tuning constants.
 */
function tickUntil(world: GameWorld, done: () => boolean, limit = 20): boolean {
    const maxTicks = Math.ceil(limit / TICK_SECONDS);
    for (let i = 0; i < maxTicks; i++) {
        if (done()) return true;
        world.tick();
    }
    return done();
}

const UP_AT_EDGE: CarSpec = { col: 2, row: 0, dir: 'up', length: 2, color: 0xe74c3c };

test('a car whose path is blocked only honks: no penalty, no movement', () => {
    // A blocker sits directly in front of the second car's nose.
    const world = worldWith([
        { col: 2, row: 0, dir: 'up', length: 2, color: 0x3498db },
        { col: 2, row: 2, dir: 'up', length: 2, color: 0xe74c3c },
    ]);

    world.tapCell(2, 3); // the tail of the second car

    assert.equal(world.leaving.length, 0, 'it did not start moving');
    assert.equal(world.parked.length, 2, 'nothing left the lot');
    assert.equal(world.scoreState.lives, 3, 'no fender lost');
    assert.equal(world.scoreState.score, 0, 'no points');
    assert.equal(world.phase, 'playing');
});

test('a tap on any cell of a car selects that whole car', () => {
    const world = worldWith([{ col: 2, row: 1, dir: 'up', length: 2, color: 0xe74c3c }]);

    // The nose is at (2, 1); the body trails behind it at (2, 2).
    world.tapCell(2, 2);

    assert.equal(world.leaving.length, 1, 'tapping the tail drives the car');
    assert.equal(world.parked.length, 0);
});

test('a car with a clear path drives out and joins the ring, scoring x100', () => {
    // The decoy keeps the lot occupied, so the round does not finish and pay the clear
    // bonus on top: this asserts the release payout alone.
    const world = worldWith([UP_AT_EDGE, DECOY]);

    world.tapCell(2, 0);
    assert.equal(world.leaving.length, 1, 'the car is on its way out');

    assert.ok(tickUntil(world, () => world.ring.length === 1), 'it joined the ring');

    assert.equal(world.leaving.length, 0, 'it left the lot for good');
    assert.equal(world.scoreState.score, 100);
    assert.equal(world.scoreState.cleared, 1);
    assert.equal(world.phase, 'playing', 'the decoy is still waiting');
});

test('a blocked car waits, then leaves once the way is clear', () => {
    const world = worldWith([
        { col: 2, row: 0, dir: 'up', length: 2, color: 0x3498db },
        { col: 2, row: 2, dir: 'up', length: 2, color: 0xe74c3c },
    ]);

    world.tapCell(2, 3);
    assert.equal(world.leaving.length, 0, 'the lane is occupied');

    // The front car clears the lane. It enters at the same ring cell the second car will
    // need, so the second car has to wait out a whole lap — waiting is always safe.
    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.ring.length === 1));

    world.tapCell(2, 3);
    assert.equal(world.leaving.length, 1, 'now the second car can go');

    assert.ok(tickUntil(world, () => world.scoreState.cleared === 2), 'and it makes it out');
    assert.equal(world.scoreState.lives, 3, 'without a scratch');
});

test('a car crashing into the ring bounces back to its spot and costs a fender', () => {
    const world = worldWith([UP_AT_EDGE]);
    const entry = entryCellIndex(world.cols, world.rows, UP_AT_EDGE.col, UP_AT_EDGE.row, 'up');

    // A long blocker straddles the entry window and stays over it while the car arrives.
    world.ring.push({ id: 99, pos: entry + 0.5, length: 5, color: 0x2ecc71, entry, isBus: false });

    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.scoreState.crashes === 1), 'it crashed');

    assert.equal(world.ring.length, 1, 'only the blocker is still on the ring');
    assert.equal(world.scoreState.lives, 2, 'one fender gone');
    assert.equal(world.phase, 'playing', 'the round carries on');

    // The car is parked again, in the very same spot, ready to try once more.
    assert.ok(tickUntil(world, () => world.parked.some((car) => car.col === 2 && car.row === 0)));
    assert.equal(world.parked[0].dir, 'up');
});

test('a crash wipes the combo, so the next release pays x1 again', () => {
    const world = worldWith([UP_AT_EDGE, DECOY]);
    const entry = entryCellIndex(world.cols, world.rows, UP_AT_EDGE.col, UP_AT_EDGE.row, 'up');

    // Build a combo out of band: this test is about what a crash does to it.
    world.scoreState.registerRelease(world.elapsed);
    world.scoreState.registerRelease(world.elapsed);
    assert.equal(world.scoreState.multiplier, 2);
    assert.equal(world.scoreState.score, 300);

    world.ring.push({ id: 99, pos: entry + 0.5, length: 5, color: 0x2ecc71, entry, isBus: false });
    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.scoreState.crashes === 1));

    assert.equal(world.scoreState.multiplier, 1, 'the crash reset the chain');
    assert.equal(world.scoreState.score, 300, 'and a crash earns nothing');

    // Wait for the bounce to finish, clear the road, then release: the chain starts over.
    assert.ok(tickUntil(world, () => world.parked.some((car) => car.col === 2 && car.row === 0)));
    world.ring.length = 0;
    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.scoreState.cleared === 3));
    assert.equal(world.scoreState.score, 400);
    assert.equal(world.scoreState.multiplier, 1);
});

test('losing the last fender ends the round as a loss', () => {
    const world = worldWith([UP_AT_EDGE]);
    const entry = entryCellIndex(world.cols, world.rows, UP_AT_EDGE.col, UP_AT_EDGE.row, 'up');

    for (let i = 0; i < 3; i++) {
        world.ring.push({ id: 100 + i, pos: entry + 0.5, length: 5, color: 0x2ecc71, entry, isBus: false });
        world.tapCell(2, 0);
        assert.ok(tickUntil(world, () => world.scoreState.crashes === i + 1), `crash ${i + 1}`);
        world.ring.length = 0;
        assert.ok(tickUntil(world, () => world.parked.some((car) => car.col === 2)));
    }

    assert.equal(world.scoreState.lives, 0);
    assert.equal(world.phase, 'lost');
});

test('a circling car leaves the ring after exactly one lap', () => {
    // Two cars, so the round is still live while the first one circles: an empty lot ends
    // the round immediately, which would freeze the ring before a lap could finish.
    const world = worldWith([UP_AT_EDGE, { col: 0, row: 0, dir: 'up', length: 2, color: 0x9b59b6 }]);

    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.ring.length === 1));

    assert.ok(tickUntil(world, () => world.ring.length === 0), 'it finished its lap and drove off');
    assert.equal(world.scoreState.lives, 3, 'and it never caused a crash');
    assert.equal(world.phase, 'playing', 'the second car is still waiting');

    // Exactly one lap, no more: it has not come back for a second go.
    assert.equal(world.scoreState.cleared, 1);
});

test('a near miss against a circling car pays the bonus', () => {
    const world = worldWith([UP_AT_EDGE, DECOY]);
    const entry = entryCellIndex(world.cols, world.rows, UP_AT_EDGE.col, UP_AT_EDGE.row, 'up');

    // Just clear of the two-cell window, so the join is legal but tight.
    world.ring.push({ id: 99, pos: entry + 2.5, length: 2, color: 0x2ecc71, entry, isBus: false });

    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.scoreState.cleared === 1));

    assert.equal(world.scoreState.score, 150, '100 for the car plus the 50 near miss');
});

test('releases inside the combo window chain up to the cap', () => {
    // Two cars entering at opposite ends of the ring, plus a decoy so the round is still
    // live when the second one joins — otherwise the clear bonus lands on top of the
    // chain payout and hides the number being measured.
    const world = worldWith([
        { col: 3, row: 0, dir: 'up', length: 2, color: 0xe74c3c },
        { col: 0, row: 3, dir: 'down', length: 2, color: 0x3498db },
        DECOY,
    ]);

    world.tapCell(3, 0);
    world.tapCell(0, 3);
    assert.ok(tickUntil(world, () => world.scoreState.cleared === 2));

    assert.equal(world.scoreState.multiplier, 2);
    assert.equal(world.scoreState.score, 300, '100 x1 plus 100 x2');
    assert.equal(world.phase, 'playing');
});

test('tapping the ring, or empty space, does nothing at all', () => {
    const world = worldWith([UP_AT_EDGE]);

    world.tapCell(-1, 0);
    world.tapCell(99, 99);
    world.tapCell(0, 3);

    assert.equal(world.leaving.length, 0);
    assert.equal(world.parked.length, 1);
    assert.equal(world.scoreState.lives, 3);
});

test('a finished round ignores further taps', () => {
    const world = worldWith([UP_AT_EDGE]);

    world.tapCell(2, 0);
    assert.ok(tickUntil(world, () => world.phase === 'won'));
    const settled = world.scoreState.score;

    world.tapCell(2, 0);
    assert.equal(world.ring.length, 1, 'nothing new joined');
    assert.equal(world.scoreState.score, settled, 'and no second payout');
    assert.equal(world.scoreState.cleared, 1, 'the lot was cleared exactly once');
});

test('the entry window covers the whole car plus the cell upstream of it', () => {
    const world = worldWith([UP_AT_EDGE]);
    const entry = entryCellIndex(world.cols, world.rows, UP_AT_EDGE.col, UP_AT_EDGE.row, 'up');

    // A length-2 car needs itself plus one cell of breathing room.
    assert.deepEqual(world.entryWindowCells(entry, 2), [entry, entry - 1]);
    // A length-3 car needs three cells; a length-1 car still gets the minimum of two.
    assert.deepEqual(world.entryWindowCells(entry, 3), [entry, entry - 1, entry - 2]);
    assert.deepEqual(world.entryWindowCells(entry, 1), [entry, entry - 1]);
    // The window wraps the lap rather than running off the start of the ring.
    assert.equal(world.entryWindowCells(0, 3)[2], world.ringCells - 2);
});

test('the snapshot describes the lot, the ring and the live entry windows', () => {
    const world = worldWith([UP_AT_EDGE, { col: 0, row: 3, dir: 'down', length: 2, color: 0x3498db }]);
    const snapshot = world.snapshot();

    assert.equal(snapshot.cols, 4);
    assert.equal(snapshot.rows, 4);
    assert.equal(snapshot.ringCells, 20);
    assert.equal(snapshot.parked.length, 2);
    assert.equal(snapshot.totalCars, 2);
    assert.equal(snapshot.phase, 'playing');
    assert.equal(snapshot.entries.length, 2, 'one window per waiting car');

    for (const entry of snapshot.entries) {
        assert.equal(entry.occupied, 0, 'nothing is circling yet');
        assert.ok(entry.cells.length >= 2);
    }

    // Every view carries lot-space numbers only, never pixels.
    const car = snapshot.parked[0];
    assert.equal(typeof car.col, 'number');
    assert.equal(typeof car.row, 'number');
});
