import test from 'node:test';
import assert from 'node:assert/strict';

import { applySlow, effectiveDamage, noSlow, speedMultiplier, tickSlow } from '../src/domain/damage.ts';

/**
 * Damage and slow rules — the two formulas the whole balance hangs on.
 *
 * Armor is a percentage reduction (`raw x 100 / (100 + armor x (1 - pierce))`), slows
 * never stack (strongest wins), and bosses shrug off half of every slow.
 */

function relativeDamage(raw: number, armor: number, pierce: number): number {
    return effectiveDamage(raw, armor, pierce) / raw;
}

test('a dart hits a 40-armor brute for 71% of its damage', () => {
    const ratio = relativeDamage(6, 40, 0);
    assert.ok(Math.abs(ratio - 100 / 140) < 1e-12, `ratio was ${ratio}`);
    assert.ok(Math.abs(ratio - 0.714) < 0.001, 'the design document quotes 71%');
});

test('a cannon ignores half the armor and hits for 83%', () => {
    const ratio = relativeDamage(28, 40, 0.5);
    assert.ok(Math.abs(ratio - 100 / 120) < 1e-12, `ratio was ${ratio}`);
    assert.ok(Math.abs(ratio - 0.833) < 0.001, 'the design document quotes 83%');
    assert.ok(ratio > relativeDamage(28, 40, 0), 'piercing must beat not piercing');
});

test('unarmoured enemies take the raw damage', () => {
    assert.equal(effectiveDamage(6, 0, 0), 6);
    assert.equal(effectiveDamage(28, 0, 0.5), 28);
});

test('the strongest slow wins and a weaker hit cannot overwrite it', () => {
    const state = noSlow();

    assert.equal(applySlow(state, 0.4, 1.5, false), true);
    assert.equal(state.strength, 0.4);
    assert.equal(state.seconds, 1.5);

    // A weaker slow is refused outright: strength and timer both stay put.
    assert.equal(applySlow(state, 0.3, 2, false), false);
    assert.equal(state.strength, 0.4);
    assert.equal(state.seconds, 1.5);

    // An equal or stronger slow refreshes the timer and takes over.
    assert.equal(applySlow(state, 0.5, 1, false), true);
    assert.equal(state.strength, 0.5);
    assert.equal(state.seconds, 1);
});

test('bosses shrug off half of every slow', () => {
    const state = noSlow();
    assert.equal(applySlow(state, 0.4, 1.5, true), true);
    assert.ok(Math.abs(state.strength - 0.2) < 1e-12, `boss strength was ${state.strength}`);
    assert.equal(state.seconds, 1.5);
});

test('a zero-strength or zero-duration slow is not applied at all', () => {
    const state = noSlow();
    assert.equal(applySlow(state, 0, 1, false), false);
    assert.equal(applySlow(state, 0.4, 0, false), false);
    assert.equal(state.strength, 0);
});

test('a slow wears off and the speed returns to normal', () => {
    const state = noSlow();
    applySlow(state, 0.4, 1.5, false);
    assert.ok(Math.abs(speedMultiplier(state) - 0.6) < 1e-12, 'a 40% slow leaves 60% speed');

    tickSlow(state, 0.5);
    assert.ok(Math.abs(state.seconds - 1.0) < 1e-9);
    assert.equal(state.strength, 0.4);

    tickSlow(state, 2);
    assert.equal(state.seconds, 0);
    assert.equal(state.strength, 0);
    assert.equal(speedMultiplier(state), 1);
});
