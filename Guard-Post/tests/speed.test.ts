import test from 'node:test';
import assert from 'node:assert/strict';

import { nextSpeed, scaledDelta } from '../src/adapters/phaser/speed.ts';

/** Speed is presentation state: the simulation keeps its fixed step, only time scales. */
test('the boost toggles between 1x and 2x', () => {
    assert.equal(nextSpeed(1), 2);
    assert.equal(nextSpeed(2), 1);
    assert.equal(nextSpeed(nextSpeed(1)), 1);
});

test('boosted frames feed twice the wall-clock time to the fixed-step loop', () => {
    assert.equal(scaledDelta(16, 1), 16);
    assert.equal(scaledDelta(16, 2), 32);
    assert.equal(scaledDelta(0, 2), 0);
});
