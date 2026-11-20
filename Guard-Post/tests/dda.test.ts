import test from 'node:test';
import assert from 'node:assert/strict';

import {
    clampDdaTier,
    ddaArmorBonus,
    ddaHpMultiplier,
    ddaScoreMultiplier,
    ddaSpeedMultiplier,
    nextDdaTier,
    scaleEnemyStats,
} from '../src/domain/dda.ts';
import { MAX_DDA_TIER } from '../src/domain/types.ts';

/** DDA is pure arithmetic over a tier, so it can be checked without a renderer. */
test('the tier stays inside its documented range', () => {
    assert.equal(clampDdaTier(-3), 0);
    assert.equal(clampDdaTier(2.9), 2);
    assert.equal(clampDdaTier(MAX_DDA_TIER + 100), MAX_DDA_TIER);
    assert.equal(clampDdaTier(Number.NaN), 0);
});

test('clean play climbs one tier at a time and caps; a leak drops straight to normal', () => {
    assert.equal(nextDdaTier(0, 'clean'), 1);
    assert.equal(nextDdaTier(3, 'clean'), 4);
    assert.equal(nextDdaTier(MAX_DDA_TIER, 'clean'), MAX_DDA_TIER);
    assert.equal(nextDdaTier(7, 'leak'), 0);
});

test('higher tiers make enemies tougher and pay better scores', () => {
    assert.equal(ddaScoreMultiplier(0), 1);
    assert.ok(ddaScoreMultiplier(4) > ddaScoreMultiplier(2));
    assert.ok(ddaHpMultiplier(4) > 1);
    assert.equal(ddaArmorBonus(3), 6);
    assert.ok(ddaSpeedMultiplier(4) > 1);

    const scaled = scaleEnemyStats({ hp: 100, armor: 10, speed: 2 }, 2);
    assert.equal(scaled.hp, Math.round(100 * ddaHpMultiplier(2)));
    assert.equal(scaled.armor, 10 + ddaArmorBonus(2));
    assert.ok(scaled.speed > 2);
});
