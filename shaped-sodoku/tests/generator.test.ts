import test from 'node:test';
import assert from 'node:assert/strict';

import { GRID_4, GRID_6, createBoard } from '../src/domain/Board.ts';
import { configForLevel, gridForLevel } from '../src/domain/RoundState.ts';
import { countSolutions, generatePuzzleFromSeed, mulberry32 } from '../src/domain/PuzzleGenerator.ts';
import { isBoardComplete, isConsistent } from '../src/domain/Rules.ts';
import { givenCount } from './helpers.ts';

test('mulberry32 is reproducible and stays inside [0, 1)', () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    const c = mulberry32(2027);

    const first = Array.from({ length: 32 }, () => a.next());
    const second = Array.from({ length: 32 }, () => b.next());
    const third = Array.from({ length: 32 }, () => c.next());

    assert.deepEqual(first, second, 'the same seed must produce the same stream');
    assert.notDeepEqual(first, third, 'different seeds should diverge');
    for (const value of [...first, ...third]) {
        assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
    }
});

test('a generated puzzle is consistent, playable and has exactly one solution', () => {
    for (let seed = 1; seed <= 60; seed++) {
        const size = seed % 3 === 0 ? GRID_6 : GRID_4;
        const requested = size === GRID_4 ? 8 : 18;
        const board = generatePuzzleFromSeed(size, requested, seed);

        assert.equal(isConsistent(board), true, `seed ${seed} produced a conflicting board`);
        assert.equal(countSolutions(board, 2), 1, `seed ${seed} did not yield a unique puzzle`);
        assert.equal(isBoardComplete(board), false, `seed ${seed} was dealt already finished`);
    }
});

test('the generator reaches the requested given count rather than leaving it short', () => {
    // Levels 1-3 ask for 8 → 6 givens; levels 4-7 ask for 18 → 14. The generator may fall
    // back to *more* givens if uniqueness cannot be preserved, so this guards both ends.
    const expectations: Array<{ size: typeof GRID_4 | typeof GRID_6; requested: number }> = [
        { size: GRID_4, requested: 8 },
        { size: GRID_4, requested: 7 },
        { size: GRID_4, requested: 6 },
        { size: GRID_6, requested: 18 },
        { size: GRID_6, requested: 14 },
        { size: GRID_6, requested: 12 },
    ];

    for (const { size, requested } of expectations) {
        for (let seed = 100; seed < 110; seed++) {
            const board = generatePuzzleFromSeed(size, requested, seed);
            assert.equal(
                givenCount(board),
                requested,
                `${size.size}x${size.size} asked for ${requested} givens (seed ${seed})`,
            );
        }
    }
});

test('the same seed regenerates the same puzzle, a different seed does not', () => {
    const first = generatePuzzleFromSeed(GRID_6, 16, 4242);
    const again = generatePuzzleFromSeed(GRID_6, 16, 4242);
    const other = generatePuzzleFromSeed(GRID_6, 16, 4243);

    assert.deepEqual(first.cells, again.cells, 'Retry must be able to replay an identical puzzle');
    assert.notDeepEqual(first.cells, other.cells, 'a fresh level should deal a fresh puzzle');
    assert.deepEqual(first.givens, again.givens);
});

test('countSolutions stops at its limit instead of exhausting the search', () => {
    // A blank 4x4 has 288 solutions; the uniqueness check only ever needs to know that
    // there is more than one, so it must bail out rather than count them all.
    const blank = createBoard(GRID_4);
    assert.equal(countSolutions(blank, 2), 2);
    assert.equal(countSolutions(blank, 1), 1);
});

test('difficulty ramps exactly as the level table promises', () => {
    assert.deepEqual(
        [1, 2, 3].map((level) => givenCount(generatePuzzleFromSeed(gridForLevel(level), configForLevel(level).givenCount, level))),
        [8, 7, 6],
    );
    assert.deepEqual(
        [4, 5, 6, 7].map((level) => givenCount(generatePuzzleFromSeed(gridForLevel(level), configForLevel(level).givenCount, level))),
        [18, 17, 16, 15],
    );
});

test('the level table moves from 4x4 to 6x6 and keeps thinning after level 8', () => {
    assert.equal(gridForLevel(3).size, 4, 'the tutorial block stays on 4x4');
    assert.equal(gridForLevel(4).size, 6, 'level 4 introduces the six shapes');
    assert.equal(gridForLevel(99).size, 6, 'later levels stay on 6x6');

    assert.equal(configForLevel(1).givenCount, 8);
    assert.equal(configForLevel(3).givenCount, 6);
    assert.equal(configForLevel(4).givenCount, 18);
    assert.equal(configForLevel(7).givenCount, 15);
    assert.equal(configForLevel(8).givenCount, 14);
    assert.ok(configForLevel(20).givenCount <= 14, 'late levels must not get easier');
    assert.ok(configForLevel(20).givenCount >= 10, 'nor unfair');
});

test('every round is played with three hearts and a par time suited to its grid', () => {
    assert.equal(configForLevel(1).hearts, 3);
    assert.equal(configForLevel(5).hearts, 3);
    assert.ok(configForLevel(1).parSeconds < configForLevel(5).parSeconds, 'a 6x6 deserves a longer par');
});
