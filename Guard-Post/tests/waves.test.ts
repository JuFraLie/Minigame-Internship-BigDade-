import test from 'node:test';
import assert from 'node:assert/strict';

import {
    generateLevelPlan,
    generateWave,
    scheduleThreat,
    scheduleTypes,
    waveBudget,
} from '../src/domain/levelGenerator.ts';
import {
    ENEMY_SPECS,
    MAX_WAVES_PER_LEVEL,
    MIN_WAVES_PER_LEVEL,
    wavesForLevel,
    type EnemyType,
} from '../src/domain/types.ts';

/**
 * Threat-budget wave generation.
 *
 * The design document's wave rules, asserted directly: deterministic schedules, budgets
 * that are never overspent, a wave count that ramps from 3 to 10 as levels go on, the
 * unlock schedule by level, compositions that vary, and one boss every fifth level. If
 * any of these drift, the balance tests and the scripted bots stop meaning anything.
 */

test('waves per level ramp from 3 to a cap of 10', () => {
    assert.equal(wavesForLevel(1), MIN_WAVES_PER_LEVEL);
    assert.equal(wavesForLevel(15), MAX_WAVES_PER_LEVEL);
    assert.equal(wavesForLevel(30), MAX_WAVES_PER_LEVEL);

    let previous = 0;
    for (let level = 1; level <= 30; level++) {
        const count = wavesForLevel(level);
        assert.ok(count >= previous, `level ${level} went backwards`);
        assert.ok(count <= MAX_WAVES_PER_LEVEL, `level ${level} exceeded the cap`);
        previous = count;
    }
});

test('the same level and wave always produce the same schedule', () => {
    for (const level of [1, 2, 7, 13, 20]) {
        for (let wave = 1; wave <= wavesForLevel(level); wave++) {
            const first = generateWave(level, wave);
            const second = generateWave(level, wave);
            assert.deepEqual(first, second, `level ${level} wave ${wave} is not deterministic`);
        }
    }
});

test('a schedule never overspends its threat budget', () => {
    for (let level = 1; level <= 30; level++) {
        for (let wave = 1; wave <= wavesForLevel(level); wave++) {
            const entries = generateWave(level, wave);
            assert.ok(entries, `level ${level} wave ${wave}`);
            const budget = waveBudget(level, wave);
            const spent = scheduleThreat(entries, false); // the boss rides on top
            assert.ok(spent <= budget, `L${level} W${wave}: spent ${spent} of ${budget}`);
            assert.ok(spent >= budget * 0.5, `L${level} W${wave}: spent only ${spent} of ${budget}`);
        }
    }
});

test('the budget grows with the level and with the wave', () => {
    assert.ok(waveBudget(2, 1) > waveBudget(1, 1));
    assert.ok(waveBudget(1, 2) > waveBudget(1, 1));
    assert.ok(waveBudget(1, 3) > waveBudget(1, 2));
    // Even a 10-wave level finishes at the same 1.7x lift as the old 3-wave one.
    assert.ok(Math.abs(waveBudget(20, 10) / waveBudget(20, 1) - 1.7) < 1e-9);
});

test('level 1 fields grunts only — the opening stays gentle', () => {
    for (let wave = 1; wave <= wavesForLevel(1); wave++) {
        const entries = generateWave(1, wave);
        assert.ok(entries);
        assert.deepEqual(scheduleTypes(entries), ['grunt'], `level 1 wave ${wave}`);
    }
});

test('runners join from level 2, brutes from level 3, and never earlier', () => {
    for (const level of [1, 2]) {
        for (let wave = 1; wave <= wavesForLevel(level); wave++) {
            const entries = generateWave(level, wave);
            assert.ok(entries);
            const types = scheduleTypes(entries);
            if (level === 1) {
                assert.deepEqual(types, ['grunt'], `level ${level} wave ${wave}`);
            } else {
                assert.ok(!types.includes('brute'), `level ${level} wave ${wave} fields brutes too early`);
            }
        }
    }
    for (const level of [3, 4, 9]) {
        const third = generateWave(level, 3);
        assert.ok(third);
        const types = scheduleTypes(third);
        for (const type of ['grunt', 'runner', 'brute'] as const) {
            assert.ok(types.includes(type), `level ${level} wave 3 must field ${type}`);
        }
    }
});

test('wave compositions vary from level to level', () => {
    const seen = new Set<string>();
    for (let level = 2; level <= 16; level++) {
        for (let wave = 1; wave <= wavesForLevel(level); wave++) {
            const entries = generateWave(level, wave);
            assert.ok(entries);
            seen.add(scheduleTypes(entries).join('+'));
        }
    }
    assert.ok(seen.size >= 4, `expected varied compositions, saw ${seen.size}: ${[...seen].join(', ')}`);
});

test('every fifth level appends exactly one boss to its last wave', () => {
    for (let level = 1; level <= 15; level++) {
        const lastWave = wavesForLevel(level);
        const schedule = generateWave(level, lastWave);
        assert.ok(schedule);
        const bosses = schedule.filter((entry) => entry.type === 'boss');

        if (level % 5 === 0) {
            assert.equal(bosses.length, 1, `level ${level} needs exactly one boss`);
            assert.equal(schedule[schedule.length - 1].type, 'boss', 'the boss arrives after everything else');
        } else {
            assert.equal(bosses.length, 0, `level ${level} must not field a boss`);
        }
    }
});

test('spawn times never move backwards', () => {
    for (let level = 1; level <= 20; level++) {
        for (let wave = 1; wave <= wavesForLevel(level); wave++) {
            const entries = generateWave(level, wave);
            assert.ok(entries);
            for (let i = 1; i < entries.length; i++) {
                assert.ok(entries[i].time >= entries[i - 1].time, `L${level} W${wave} entry ${i}`);
            }
        }
    }
});

test('wave indices outside the level ramp and levels below 1 are rejected', () => {
    assert.equal(generateWave(1, 0), null);
    assert.equal(generateWave(1, wavesForLevel(1) + 1), null);
    assert.equal(generateWave(20, MAX_WAVES_PER_LEVEL + 1), null);
    assert.equal(generateWave(0, 1), null);
});

test('a level plan holds every wave of its ramp, none empty', () => {
    for (const level of [1, 3, 15, 20]) {
        const plan = generateLevelPlan(level);
        assert.equal(plan.length, wavesForLevel(level), `level ${level}`);
        for (const [index, wave] of plan.entries()) {
            assert.ok(wave.length > 0, `L${level} wave ${index + 1} is empty`);
        }
    }
});

test('spawn gaps follow the enemy specs', () => {
    const seen = new Set<EnemyType>();
    for (const entry of generateWave(6, 3) ?? []) seen.add(entry.type);
    assert.ok(seen.size >= 2);

    // Within one contiguous run of the same type the gap is exactly the spec's.
    const grunts = generateWave(1, 1) ?? [];
    for (let i = 1; i < grunts.length; i++) {
        const gap = grunts[i].time - grunts[i - 1].time;
        assert.ok(Math.abs(gap - ENEMY_SPECS.grunt.spawnGap) < 1e-9);
    }
});
