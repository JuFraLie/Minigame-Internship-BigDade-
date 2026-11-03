import test from 'node:test';
import assert from 'node:assert/strict';

import { GRID_4, GRID_6, withPlacement } from '../src/domain/Board.ts';
import {
    canPlace,
    completedLinesAfter,
    findConflict,
    isBoardComplete,
    isConsistent,
    isLineComplete,
} from '../src/domain/Rules.ts';
import { boardFrom } from './helpers.ts';

/** A finished four-by-four: two 2x2 boxes, every line holding 0-3 exactly once. */
const SOLVED_4 = [
    [0, 1, 2, 3],
    [2, 3, 0, 1],
    [1, 0, 3, 2],
    [3, 2, 1, 0],
];

/** The same board with the top-left two cells still to play. */
const OPEN_4 = [
    [null, null, 2, 3],
    [2, 3, 0, 1],
    [1, 0, 3, 2],
    [3, 2, 1, 0],
];

/**
 * Rows and columns are each clean, but both boxes collide — the case that proves the box
 * rule is checked independently of rows and columns.
 */
const BOX_COLLISION_4 = [
    [2, 1, 0, 3],
    [0, 2, 3, 1],
    [1, 3, 2, 0],
    [3, 0, 1, 2],
];

/**
 * A finished six-by-six with 2x3 boxes, from value = (k + 3i + 3j + 2b) mod 6 — which is
 * distinct along every row, column and box by construction.
 */
const SOLVED_6 = [
    [0, 1, 2, 3, 4, 5],
    [3, 4, 5, 0, 1, 2],
    [2, 3, 4, 5, 0, 1],
    [5, 0, 1, 2, 3, 4],
    [4, 5, 0, 1, 2, 3],
    [1, 2, 3, 4, 5, 0],
];

test('a solved board is complete and consistent', () => {
    assert.equal(isBoardComplete(boardFrom(GRID_4, SOLVED_4)), true);
    assert.equal(isConsistent(boardFrom(GRID_4, SOLVED_4)), true);

    assert.equal(isBoardComplete(boardFrom(GRID_6, SOLVED_6)), true);
    assert.equal(isConsistent(boardFrom(GRID_6, SOLVED_6)), true);
});

test('an unfinished board is consistent but not complete', () => {
    const board = boardFrom(GRID_4, OPEN_4);
    assert.equal(isConsistent(board), true);
    assert.equal(isBoardComplete(board), false);
});

test('every line of a solved board reports complete', () => {
    const four = boardFrom(GRID_4, SOLVED_4);
    for (let index = 0; index < 4; index++) {
        assert.equal(isLineComplete(four, { kind: 'row', index }), true, `row ${index}`);
        assert.equal(isLineComplete(four, { kind: 'column', index }), true, `column ${index}`);
        assert.equal(isLineComplete(four, { kind: 'box', index }), true, `box ${index}`);
    }

    const six = boardFrom(GRID_6, SOLVED_6);
    for (let index = 0; index < 6; index++) {
        assert.equal(isLineComplete(six, { kind: 'row', index }), true, `row ${index}`);
        assert.equal(isLineComplete(six, { kind: 'box', index }), true, `box ${index}`);
    }
});

test('a line with a hole or a repeat is not complete', () => {
    const board = boardFrom(GRID_4, OPEN_4);
    assert.equal(isLineComplete(board, { kind: 'row', index: 0 }), false, 'row 0 is unfinished');

    const repeated = boardFrom(GRID_4, [
        [0, 0, 2, 3],
        [2, 3, 1, 1],
        [1, 2, 3, 0],
        [3, 1, 0, 2],
    ]);
    assert.equal(isLineComplete(repeated, { kind: 'row', index: 0 }), false, 'row 0 repeats 0');
    assert.equal(isConsistent(repeated), false, 'the board should be rejected as inconsistent');
});

test('a shape already in the row blocks a placement', () => {
    const board = boardFrom(GRID_4, OPEN_4);
    // Row 0 already holds a 2 two cells to the right, and the row is checked first.
    const conflict = findConflict(board, 0, 0, 2);
    assert.ok(conflict);
    assert.equal(conflict.kind, 'row');
    assert.equal(conflict.index, 0);
    assert.equal(conflict.at, 2);
    assert.equal(canPlace(board, 0, 0, 2), false);
});

test('a shape already in the box blocks a placement even when row and column are clear', () => {
    const board = boardFrom(GRID_4, BOX_COLLISION_4);
    // Row 1 holds 0,2,3,1 and column 1 holds 1,2,3,0 — neither contains a second 2…
    const conflict = findConflict(board, 1, 1, 2);
    assert.ok(conflict, 'the box rule should have fired');
    // …but box 0 already holds a 2 at (0,0).
    assert.equal(conflict.kind, 'box');
    assert.equal(conflict.at, 0);
});

test('a filled cell cannot be played, an open legal cell can', () => {
    const board = boardFrom(GRID_4, OPEN_4);
    assert.equal(canPlace(board, 1, 0, 2), false, '(1,0) already holds a 2');
    assert.equal(canPlace(board, 0, 0, 0), true, 'the free cell can take its one legal shape');
});

test('coordinates outside the grid are rejected rather than throwing', () => {
    const board = boardFrom(GRID_4, SOLVED_4);
    assert.equal(canPlace(board, -1, 0, 0), false);
    assert.equal(canPlace(board, 0, 9, 0), false);
    assert.equal(findConflict(board, 99, 99, 0), null);
});

test('the last fill reports every line it closed', () => {
    // One cell left open: filling it closes its row, its column and its box together.
    const board = boardFrom(GRID_4, [
        [null, 1, 2, 3],
        [2, 3, 0, 1],
        [1, 0, 3, 2],
        [3, 2, 1, 0],
    ]);
    const filled = withPlacement(board, 0, 0, 0);
    const lines = completedLinesAfter(filled, 0, 0).map((line) => `${line.kind}:${line.index}`);
    assert.deepEqual(lines.sort(), ['box:0', 'column:0', 'row:0']);
});

test('a fill that leaves every line short reports nothing', () => {
    // Three cells still open, all inside row 0, column 0 and box 0 — so no single fill
    // can close any of them.
    const board = boardFrom(GRID_4, [
        [null, null, 2, 3],
        [null, 3, 0, 1],
        [1, 0, 3, 2],
        [3, 2, 1, 0],
    ]);
    const filled = withPlacement(board, 0, 0, 0);
    assert.equal(completedLinesAfter(filled, 0, 0).length, 0, 'nothing closed by that fill');
});
