import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SCORING, ScoreLedger, formatScore } from '../src/domain/Scoring.ts';

test('a correct placement pays the base amount at ×1 to start the streak', () => {
    const ledger = new ScoreLedger();
    const result = ledger.recordCorrect();

    assert.deepEqual(result, { gained: 100, multiplier: 1 });
    assert.equal(ledger.score, 100);
    assert.equal(ledger.streak, 1);
});

test('the streak multiplier climbs ×1 → ×2 → ×3 and then stops', () => {
    const ledger = new ScoreLedger();

    assert.equal(ledger.recordCorrect().gained, 100, 'first placement');
    assert.equal(ledger.recordCorrect().gained, 200, 'second placement doubles up');
    assert.equal(ledger.recordCorrect().gained, 300, 'third placement triples');
    assert.equal(ledger.recordCorrect().gained, 300, 'fourth stays capped at ×3');
    assert.equal(ledger.recordCorrect().gained, 300, 'and keeps staying there');
    assert.equal(ledger.score, 1200, '100 + 200 + 300 + 300 + 300');
    assert.equal(ledger.multiplier, 3);
});

test('a mistake breaks the streak, so the next placement is back to ×1', () => {
    const ledger = new ScoreLedger();
    ledger.recordCorrect();
    ledger.recordCorrect();
    assert.equal(ledger.streak, 2);

    ledger.recordWrong();
    assert.equal(ledger.streak, 0, 'the streak was not reset');
    assert.equal(ledger.multiplier, 1);

    assert.equal(ledger.recordCorrect().multiplier, 1, 'the next correct placement restarts at ×1');
});

test('a wrong placement costs 50, and the score never goes below zero', () => {
    const ledger = new ScoreLedger();
    ledger.recordCorrect();
    assert.equal(ledger.score, 100);

    assert.equal(ledger.recordWrong(), -50);
    assert.equal(ledger.score, 50);

    ledger.recordWrong();
    assert.equal(ledger.score, 0, 'floor reached');

    assert.equal(ledger.recordWrong(), 0, 'nothing left to take');
    assert.equal(ledger.score, 0, 'and it stays floored');
});

test('completing several lines at once pays each bonus', () => {
    const ledger = new ScoreLedger();
    assert.equal(ledger.recordLineBonus(1), 150);
    assert.equal(ledger.recordLineBonus(3), 450);
    assert.equal(ledger.recordLineBonus(0), 0);
    assert.equal(ledger.recordLineBonus(-2), 0, 'a negative count cannot earn anything');
    assert.equal(ledger.score, 600);
});

test('the time bonus pays only for seconds actually left under par', () => {
    const ledger = new ScoreLedger();
    assert.equal(ledger.recordTimeBonus(10), 50, 'ten seconds spare at five points each');
    assert.equal(ledger.recordTimeBonus(0), 0, 'exactly on par');
    assert.equal(ledger.recordTimeBonus(-15), 0, 'over par earns nothing, not a penalty');
    assert.equal(ledger.recordTimeBonus(2.9), 10, 'fractions of a second round down');
    assert.equal(ledger.score, 60);
});

test('a custom scoring table is honoured', () => {
    const ledger = new ScoreLedger({ ...DEFAULT_SCORING, correctPlacement: 10, maxStreak: 2 });
    ledger.recordCorrect();
    assert.equal(ledger.recordCorrect().gained, 20);
    assert.equal(ledger.recordCorrect().gained, 20, 'capped at ×2 by the custom table');
});

test('scores are grouped in thousands the same way everywhere', () => {
    assert.equal(formatScore(0), '0');
    assert.equal(formatScore(999), '999');
    assert.equal(formatScore(1000), '1,000');
    assert.equal(formatScore(1234567), '1,234,567');
    assert.equal(formatScore(1000.6), '1,001');
});
