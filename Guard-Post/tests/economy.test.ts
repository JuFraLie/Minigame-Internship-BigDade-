import test from 'node:test';
import assert from 'node:assert/strict';

import { earlyCallBonus, killReward, sellRefund, startingGold, upgradeCost, waveClearBonus } from '../src/domain/economy.ts';

/**
 * The gold rules of the design document, straight from the table:
 * a fresh level starts rich enough for two or three towers, kills pay by type and
 * level, upgrades cost 80% then 120% of the base, and selling returns 70% of the spend.
 */

test('every level starts richer than the last', () => {
    assert.equal(startingGold(1), 100);
    assert.equal(startingGold(2), 120);
    assert.equal(startingGold(5), 180);
    for (let level = 1; level < 50; level++) {
        assert.ok(startingGold(level + 1) > startingGold(level));
    }
});

test('kill rewards scale with the level', () => {
    assert.equal(killReward('grunt', 1), 5);
    assert.equal(killReward('runner', 1), 4);
    assert.equal(killReward('brute', 1), 14);
    assert.equal(killReward('boss', 1), 60);

    // x (1 + 0.06 x (L - 1)), rounded.
    assert.equal(killReward('grunt', 10), Math.round(5 * (1 + 0.06 * 9)));
    for (const type of ['grunt', 'runner', 'brute', 'boss'] as const) {
        assert.ok(killReward(type, 20) > killReward(type, 1));
    }
});

test('clearing a wave pays 15 + 3 x level', () => {
    assert.equal(waveClearBonus(1), 18);
    assert.equal(waveClearBonus(10), 45);
});

test('calling the next wave early pays 2 gold per full second skipped', () => {
    assert.equal(earlyCallBonus(8), 16);
    assert.equal(earlyCallBonus(7.9), 14);
    assert.equal(earlyCallBonus(0.9), 0);
    assert.equal(earlyCallBonus(0), 0);
});

test('upgrades cost 80% then 120% of the base price', () => {
    assert.equal(upgradeCost('dart', 2), 32);
    assert.equal(upgradeCost('dart', 3), 48);
    assert.equal(upgradeCost('cannon', 2), 56);
    assert.equal(upgradeCost('cannon', 3), 84);
    assert.equal(upgradeCost('frost', 2), 40);
    assert.equal(upgradeCost('frost', 3), 60);
});

test('selling returns 70% of everything spent, rounded down', () => {
    assert.equal(sellRefund(40), 28);
    assert.equal(sellRefund(120), 84);
    assert.equal(sellRefund(41), 28);
    assert.equal(sellRefund(0), 0);
    for (const spent of [1, 39, 100, 999]) {
        assert.ok(sellRefund(spent) <= spent, 'a refund can never exceed the spend');
    }
});
