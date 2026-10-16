import assert from 'node:assert/strict';
import test from 'node:test';

import { entryCellIndex, mod, ringCellAt, ringDirectionAt, ringLength, ringPointAt } from '../src/core/ring.ts';

test('the ring is the perimeter of the board, counted once', () => {
    // A 4x4 lot sits inside a 6x6 board; the ring is the 36 cells minus the 16 of the lot.
    assert.equal(ringLength(4, 4), 20);
    assert.equal(ringLength(5, 6), 26);
});

test('ring cells walk clockwise and never repeat', () => {
    const cols = 4;
    const rows = 4;
    const seen = new Set<string>();

    for (let i = 0; i < ringLength(cols, rows); i++) {
        const cell = ringCellAt(cols, rows, i);
        const key = `${cell.x},${cell.y}`;
        assert.equal(seen.has(key), false, `ring cell ${key} repeated at index ${i}`);
        seen.add(key);

        // No ring cell may fall inside the lot.
        const inside = cell.x >= 0 && cell.x < cols && cell.y >= 0 && cell.y < rows;
        assert.equal(inside, false, `ring cell ${key} is inside the lot`);
    }

    assert.equal(seen.size, ringLength(cols, rows));
});

test('ring position interpolates along the segment, and wraps the lap', () => {
    const cols = 4;
    const rows = 4;

    // Index 0 is the top-left corner; the top row runs right.
    assert.deepEqual(ringCellAt(cols, rows, 0), { x: -1, y: -1 });
    assert.deepEqual(ringCellAt(cols, rows, 1), { x: 0, y: -1 });

    const half = ringPointAt(cols, rows, 0.5);
    assert.equal(half.x, -0.5, 'halfway between two top-row cells');
    assert.equal(half.y, -1);
    assert.deepEqual({ dx: half.dx, dy: half.dy }, { dx: 1, dy: 0 });

    // One full lap lands back where it started.
    assert.deepEqual(ringCellAt(cols, rows, ringLength(cols, rows)), { x: -1, y: -1 });
});

test('every ring segment points the way traffic flows', () => {
    const cols = 4;
    const rows = 4;

    // Top row runs right, right column down, bottom row left, left column up.
    assert.deepEqual(ringDirectionAt(cols, rows, 1), { dx: 1, dy: 0 });
    assert.deepEqual(ringDirectionAt(cols, rows, cols + 3), { dx: 0, dy: 1 });
    assert.deepEqual(ringDirectionAt(cols, rows, cols + rows + 4), { dx: -1, dy: 0 });
    assert.deepEqual(ringDirectionAt(cols, rows, 2 * cols + rows + 5), { dx: 0, dy: -1 });
});

test('a car drives onto the ring cell just outside its nose', () => {
    const cols = 4;
    const rows = 4;

    // Nose at the top edge facing up joins the top row, directly above itself.
    const up = entryCellIndex(cols, rows, 2, 0, 'up');
    assert.deepEqual(ringCellAt(cols, rows, up), { x: 2, y: -1 });

    const down = entryCellIndex(cols, rows, 1, rows - 1, 'down');
    assert.deepEqual(ringCellAt(cols, rows, down), { x: 1, y: rows });

    const left = entryCellIndex(cols, rows, 0, 2, 'left');
    assert.deepEqual(ringCellAt(cols, rows, left), { x: -1, y: 2 });

    const right = entryCellIndex(cols, rows, cols - 1, 3, 'right');
    assert.deepEqual(ringCellAt(cols, rows, right), { x: cols, y: 3 });
});

test('every entry cell of every lot cell is a real ring cell', () => {
    for (const [cols, rows] of [[4, 4], [5, 5], [6, 7]] as const) {
        const valid = new Set<string>();
        for (let i = 0; i < ringLength(cols, rows); i++) {
            const cell = ringCellAt(cols, rows, i);
            valid.add(`${cell.x},${cell.y}`);
        }

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                for (const dir of ['up', 'down', 'left', 'right'] as const) {
                    const index = entryCellIndex(cols, rows, col, row, dir);
                    const cell = ringCellAt(cols, rows, index);
                    assert.equal(
                        valid.has(`${cell.x},${cell.y}`),
                        true,
                        `entry for (${col},${row}) ${dir} is not a ring cell`,
                    );
                }
            }
        }
    }
});

test('mod is positive for negative inputs, so a lap can wrap', () => {
    assert.equal(mod(-1, 20), 19);
    assert.equal(mod(21, 20), 1);
    assert.equal(mod(0, 20), 0);
});
