import assert from 'node:assert/strict';
import test from 'node:test';

import { DIFFICULTY } from '../src/core/config.ts';
import { SpawnScheduler } from '../src/core/difficulty.ts';
import type { Random } from '../src/core/ports.ts';

const fixedRoll = (value: number): Random => () => value;

/** The scheduler accumulates seconds; this converts a duration expressed in milliseconds. */
const secondsFor = (ms: number): number => ms / 1000;

test('the round clock starts with a head start, so the first monster arrives early', () => {
    const scheduler = new SpawnScheduler(fixedRoll(0));

    assert.equal(scheduler.shouldSpawn(0, 0), false, 'nothing before the clock runs');

    scheduler.reset();
    const firstWait = DIFFICULTY.baseIntervalMs - DIFFICULTY.firstSpawnDelayMs;

    assert.equal(scheduler.shouldSpawn(secondsFor(firstWait - 16), 0), false, 'one frame short');
    assert.equal(scheduler.shouldSpawn(secondsFor(16), 0), true, 'a spawn is due');
    assert.equal(scheduler.shouldSpawn(0, 0), false, 'the consumed time is not reused');
});

test('the spawn interval shrinks with every defeat and stops at the floor', () => {
    const scheduler = new SpawnScheduler(fixedRoll(0));
    const onFloor = 1_000_000;

    scheduler.reset();
    const waitOnFloor = DIFFICULTY.minIntervalMs - DIFFICULTY.firstSpawnDelayMs;

    assert.equal(scheduler.shouldSpawn(secondsFor(waitOnFloor - 16), onFloor), false);
    assert.equal(scheduler.shouldSpawn(secondsFor(16), onFloor), true, 'the floor is reached');

    // An untouched round needs a full interval; a maxed-out one needs far less, which is
    // exactly the escalation the difficulty table is tuned for.
    const waitAtStart = DIFFICULTY.baseIntervalMs - DIFFICULTY.firstSpawnDelayMs;
    assert.ok(waitOnFloor < waitAtStart);
});

test('speed grows with defeats and is capped', () => {
    const scheduler = new SpawnScheduler(fixedRoll(0));

    assert.equal(scheduler.speedMultiplier(0), 1);
    assert.ok(Math.abs(scheduler.speedMultiplier(25) - 2) < 1e-9, '1 + 25 * 0.04');
    assert.equal(scheduler.speedMultiplier(1_000_000), DIFFICULTY.maxSpeedMultiplier);
});

test('the kind roll maps onto the three monster types', () => {
    assert.equal(new SpawnScheduler(fixedRoll(0.1)).nextKind(), 'normal');
    assert.equal(new SpawnScheduler(fixedRoll(DIFFICULTY.armoredRollCeiling)).nextKind(), 'normal');
    assert.equal(new SpawnScheduler(fixedRoll(0.5)).nextKind(), 'armored');
    assert.equal(new SpawnScheduler(fixedRoll(DIFFICULTY.ninjaRollCeiling)).nextKind(), 'armored');
    assert.equal(new SpawnScheduler(fixedRoll(0.9)).nextKind(), 'ninja');
});

test('two monsters only show up once the round is fast enough', () => {
    const onFloor = new SpawnScheduler(fixedRoll(0));
    assert.equal(onFloor.wantsDoubleSpawn(0), false, 'the opening is always single-spawn');

    const defeatsForDouble = Math.ceil(
        DIFFICULTY.doubleSpawnSpeedThreshold / DIFFICULTY.speedGainPerKill,
    );
    assert.equal(
        new SpawnScheduler(fixedRoll(0.9)).wantsDoubleSpawn(defeatsForDouble),
        false,
        'an unlucky roll keeps it single',
    );
    assert.equal(
        new SpawnScheduler(fixedRoll(0.1)).wantsDoubleSpawn(defeatsForDouble),
        true,
        'a lucky roll brings a second monster',
    );
});
