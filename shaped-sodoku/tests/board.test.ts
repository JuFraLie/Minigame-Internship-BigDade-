import test from 'node:test';
import assert from 'node:assert/strict';

import {
    GRID_4,
    GRID_6,
    cellIndex,
    colOfCell,
    countOf,
    createBoard,
    emptyIndices,
    gridFor,
    rowOfCell,
    withCells,
    withPlacement,
} from '../src/domain/Board.ts';

test('a 4x4 grid has four rows, four columns and four 2x2 boxes', () => {
    const grid = gridFor(GRID_4);
    assert.equal(grid.rows.length, 4);
    assert.equal(grid.cols.length, 4);
    assert.equal(grid.boxes.length, 4);
    assert.equal(grid.cellCount, 16);
    assert.ok(grid.boxes.every((box) => box.length === 4));
});

test('a 6x6 grid has six boxes of 2x3 cells', () => {
    const grid = gridFor(GRID_6);
    assert.equal(grid.rows.length, 6);
    assert.equal(grid.boxes.length, 6);
    assert.ok(grid.boxes.every((box) => box.length === 6));
});

test('every cell belongs to exactly one row, one column and one box', () => {
    for (const size of [GRID_4, GRID_6]) {
        const grid = gridFor(size);
        for (let index = 0; index < grid.cellCount; index++) {
            const row = rowOfCell(size.size, index);
            const col = colOfCell(size.size, index);
            assert.equal(cellIndex(size.size, row, col), index);
            assert.ok(grid.rows[row].includes(index));
            assert.ok(grid.cols[col].includes(index));
            assert.ok(grid.boxes[grid.boxOf[index]].includes(index));
        }
    }
});

test('boxes are cut 2x2 on the four-by-four and 2x3 on the six-by-six', () => {
    const small = gridFor(GRID_4);
    assert.equal(small.boxOf[cellIndex(4, 1, 1)], 0);
    assert.equal(small.boxOf[cellIndex(4, 1, 2)], 1);
    assert.equal(small.boxOf[cellIndex(4, 3, 3)], 3);

    const large = gridFor(GRID_6);
    assert.equal(large.boxOf[cellIndex(6, 0, 0)], 0);
    assert.equal(large.boxOf[cellIndex(6, 0, 3)], 1);
    assert.equal(large.boxOf[cellIndex(6, 2, 0)], 2);
    assert.equal(large.boxOf[cellIndex(6, 5, 5)], 5);
});

test('a fresh board is entirely empty and every cell unlocked', () => {
    const board = createBoard(GRID_4);
    assert.equal(board.cells.length, 16);
    assert.ok(board.cells.every((cell) => cell === null));
    assert.ok(board.givens.every((given) => given === false));
    assert.equal(emptyIndices(board).length, 16);
});

test('withPlacement returns a new board and leaves the original alone', () => {
    const board = createBoard(GRID_4);
    const filled = withPlacement(board, 2, 1, 3);

    assert.equal(board.cells[cellIndex(4, 2, 1)], null, 'the source board was mutated');
    assert.equal(filled.cells[cellIndex(4, 2, 1)], 3);
    assert.equal(filled.size, board.size);
    assert.notEqual(filled.cells, board.cells);
});

test('withCells marks every filled cell as a locked given', () => {
    const board = withCells(GRID_4, [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
    assert.equal(board.givens[0], true);
    assert.equal(board.givens[5], false);
    assert.equal(emptyIndices(board).length, 15);
});

test('countOf tallies each shape on the board', () => {
    const board = withCells(GRID_4, [0, 0, 1, null, null, null, null, null, null, null, null, null, null, null, null, null]);
    assert.equal(countOf(board, 0), 2);
    assert.equal(countOf(board, 1), 1);
    assert.equal(countOf(board, 2), 0);
    assert.equal(countOf(board, 3), 0);
});
