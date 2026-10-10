import assert from 'node:assert/strict';
import test from 'node:test';

import { COMBO_STEP, MAX_LIVES } from '../src/core/config.ts';
import { ScoreState } from '../src/core/scoring.ts';

test('the multiplier gains half a point every full combo step', () => {
    const score = new ScoreState();

    assert.equal(score.multiplier(), 1);

    for (let i = 0; i < COMBO_STEP - 1; i++) score.registerDefeat(100);
    assert.equal(score.multiplier(), 1, 'no bonus before the first full step');

    score.registerDefeat(100);
    assert.equal(score.multiplier(), 1.5);
});

test('the multiplier never exceeds the cap', () => {
    const score = new ScoreState();
    for (let i = 0; i < 40; i++) score.registerDefeat(100);

    assert.equal(score.multiplier(), 4, '1 base + 3 bonus');
});

test('a defeat scales the base points by the current multiplier', () => {
    const score = new ScoreState();

    const first = score.registerDefeat(100);
    assert.deepEqual(first, { earned: 100, multiplier: 1 });

    for (let i = 0; i < 3; i++) score.registerDefeat(100);
    const fifth = score.registerDefeat(200);

    assert.equal(fifth.earned, 300, '200 points at 1.5x');
    // The fourth defeat already lands on the first combo step, so it earned 150.
    assert.equal(score.score, 100 + 100 + 100 + 150 + 300);
    assert.equal(score.defeated, 5);
    assert.equal(score.maxCombo, 5);
});

test('an escape breaks the combo and costs a life', () => {
    const score = new ScoreState();
    for (let i = 0; i < 3; i++) score.registerDefeat(100);

    const outcome = score.registerEscape();

    assert.deepEqual(outcome, { lives: MAX_LIVES - 1, gameOver: false });
    assert.equal(score.combo, 0);
    assert.equal(score.maxCombo, 3, 'the best combo is remembered');
    assert.equal(score.multiplier(), 1, 'the bonus is lost with the combo');
});

test('the round is lost when the last life is gone', () => {
    const score = new ScoreState();

    score.registerEscape();
    score.registerEscape();
    const last = score.registerEscape();

    assert.deepEqual(last, { lives: 0, gameOver: true });
    assert.equal(score.registerEscape().lives, 0, 'lives never go below zero');
});

test('reset starts a brand new scorecard', () => {
    const score = new ScoreState();
    score.registerDefeat(300);
    score.registerEscape();

    score.reset();

    assert.equal(score.score, 0);
    assert.equal(score.lives, MAX_LIVES);
    assert.equal(score.combo, 0);
    assert.equal(score.maxCombo, 0);
    assert.equal(score.defeated, 0);
});
