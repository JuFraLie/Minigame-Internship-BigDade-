import test from 'node:test';
import assert from 'node:assert/strict';

import { killScore, levelClearScore, waveClearScore } from '../src/domain/score.ts';

/**
 * Per-round score: kills by enemy type, 100 x level per wave, and lives x 50 x level
 * for clearing the level. Defeats pay no clear bonus (the simulation only calls
 * `levelClearScore` on victory).
 */

test('a kill scores the base reward x 10', () => {
    assert.equal(killScore('grunt', 1), 50);
    assert.equal(killScore('runner', 1), 40);
    assert.equal(killScore('brute', 1), 140);
    assert.equal(killScore('boss', 1), 600);
});

test('kill score scales with the level', () => {
    assert.equal(killScore('grunt', 2), Math.round(50 * 1.1));
    for (const type of ['grunt', 'runner', 'brute', 'boss'] as const) {
        assert.ok(killScore(type, 15) > killScore(type, 1));
    }
});

test('clearing a wave scores 100 x level', () => {
    assert.equal(waveClearScore(1), 100);
    assert.equal(waveClearScore(7), 700);
});

test('clearing a level scores remaining lives x 50 x level', () => {
    assert.equal(levelClearScore(10, 1), 500);
    assert.equal(levelClearScore(6, 3), 900);
    assert.equal(levelClearScore(0, 3), 0);
});
