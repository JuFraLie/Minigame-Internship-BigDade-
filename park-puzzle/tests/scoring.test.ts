import assert from 'node:assert/strict';
import test from 'node:test';

import { CAR_POINTS, COMBO_WINDOW_SECONDS, LIVES, MAX_MULTIPLIER, NEAR_MISS_POINTS } from '../src/core/config.ts';
import { ScoreState } from '../src/core/scoring.ts';

test('the multiplier climbs only on releases inside the combo window', () => {
    const score = new ScoreState();

    assert.equal(score.registerRelease(0), CAR_POINTS, 'the first release is x1');
    assert.equal(score.multiplier, 1);

    // Still inside the window: the chain keeps growing.
    score.registerRelease(1);
    score.registerRelease(2);
    assert.equal(score.multiplier, 3);

    // Past the window: the chain restarts at x1 rather than carrying on.
    score.registerRelease(2 + COMBO_WINDOW_SECONDS + 0.01);
    assert.equal(score.multiplier, 1);
});

test('a release exactly on the window boundary still counts as inside', () => {
    const score = new ScoreState();

    score.registerRelease(0);
    score.registerRelease(COMBO_WINDOW_SECONDS);
    assert.equal(score.multiplier, 2);
});

test('the multiplier never exceeds the cap', () => {
    const score = new ScoreState();

    for (let i = 0; i < 40; i++) score.registerRelease(i);

    assert.equal(score.multiplier, MAX_MULTIPLIER);
    assert.equal(score.maxCombo, MAX_MULTIPLIER);
});

test('points are scaled by the multiplier at the moment of release', () => {
    const score = new ScoreState();

    assert.equal(score.registerRelease(0), CAR_POINTS * 1);
    assert.equal(score.registerRelease(0.5), CAR_POINTS * 2);
    assert.equal(score.registerRelease(1), CAR_POINTS * 3);
    assert.equal(score.score, CAR_POINTS * (1 + 2 + 3));
});

test('a near miss is flat and does not disturb the combo', () => {
    const score = new ScoreState();

    score.registerRelease(0);
    assert.equal(score.registerNearMiss(), NEAR_MISS_POINTS);
    assert.equal(score.multiplier, 1, 'the chain is untouched');
    assert.equal(score.score, CAR_POINTS + NEAR_MISS_POINTS);
});

test('a crash costs a fender and wipes the combo', () => {
    const score = new ScoreState();

    score.registerRelease(0);
    score.registerRelease(1);
    score.registerRelease(2);
    assert.equal(score.multiplier, 3);

    score.registerCrash();

    assert.equal(score.lives, LIVES - 1);
    assert.equal(score.multiplier, 1);
    assert.equal(score.crashes, 1);
    assert.equal(score.maxCombo, 3, 'the best combo of the round is remembered');

    // The next release starts a fresh chain at x1.
    score.registerRelease(3);
    assert.equal(score.multiplier, 1);
});

test('the clear bonus pays a flat amount, a bonus per fender, and a decaying time bonus', () => {
    const score = new ScoreState();
    const par = 60;

    // Instant clear, all fenders standing: the full time bonus is paid.
    const instant = score.registerClear(0, par);
    assert.equal(instant, 200 + 100 * LIVES + 300);

    const worn = new ScoreState();
    worn.lives = 1;
    const slow = worn.registerClear(par * 2, par);
    assert.equal(slow, 200 + 100 * 1, 'at twice the par the time bonus is gone');

    // Between the two, the bonus decays linearly.
    const halfway = new ScoreState();
    assert.equal(halfway.registerClear(par, par), 200 + 100 * LIVES + 150);
});
