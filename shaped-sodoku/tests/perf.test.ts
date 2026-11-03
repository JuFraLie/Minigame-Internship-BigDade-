import test from 'node:test';
import assert from 'node:assert/strict';

import { GRID_6, emptyIndices } from '../src/domain/Board.ts';
import { RoundState, configForLevel } from '../src/domain/RoundState.ts';
import type { RoundEvent } from '../src/domain/ports.ts';
import { generatePuzzleFromSeed } from '../src/domain/PuzzleGenerator.ts';
import { computeLayout, hitTest } from '../src/render/GameLayout.ts';
import { fakeClock, recorder, solve } from './helpers.ts';

/**
 * Headless performance budgets.
 *
 * The reference device class is 4 GB + MediaTek Helio G95, with a 30 FPS floor (33,300 µs
 * per frame) and a 50 FPS average. These tests never need that hardware: they measure the
 * game logic and the pure layout maths — the parts that could quietly get expensive — and
 * hold them to a small fraction of a frame. The Phaser draw itself is a static grid plus a
 * handful of tweens, which is the cheap half.
 *
 * Budgets are deliberately loose (orders of magnitude above the measured cost) so they
 * catch algorithmic regressions without ever flaking on a slow machine.
 */

/** Budget for one input frame of pure logic, in microseconds. 33,300 µs = one 30 FPS frame. */
const FRAME_BUDGET_US = 200;
/** Average per generated puzzle, in milliseconds. */
const GENERATOR_BUDGET_MS = 5;
/** Average for one layout computation plus one hit test, in microseconds. */
const LAYOUT_BUDGET_US = 50;

test('puzzle generation stays comfortably within its budget', () => {
    const RUNS = 200;

    const started = performance.now();
    for (let seed = 1; seed <= RUNS; seed++) {
        generatePuzzleFromSeed(GRID_6, 14, seed * 31 + 7);
    }
    const elapsed = performance.now() - started;
    const average = elapsed / RUNS;

    assert.ok(
        average < GENERATOR_BUDGET_MS,
        `generating one puzzle averaged ${average.toFixed(3)}ms over ${RUNS} runs (budget ${GENERATOR_BUDGET_MS}ms)`,
    );
});

test('a complete scripted playthrough costs far less than one frame each', () => {
    const config = configForLevel(5);
    const puzzle = generatePuzzleFromSeed(config.grid, config.givenCount, 20_260);
    const solution = solve(puzzle);
    const layout = computeLayout({
        width: 390,
        height: 844,
        safeTop: 44,
        safeBottom: 34,
        gridSize: 6,
        shapeCount: 6,
    });

    const moves = emptyIndices(puzzle);
    assert.ok(moves.length > 0, 'the benchmark needs cells to actually fill');
    assert.equal(solution.length, puzzle.cells.length, 'the fixture must be solvable');
    assert.ok(solution.every((cell) => cell !== null), 'every cell must receive a shape');

    const ROUNDS = 100;
    let frames = 0;
    let finalScore = 0;

    const started = performance.now();
    for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex++) {
        const clock = fakeClock();
        const { port } = recorder<RoundEvent>();
        const round = new RoundState(config, puzzle, clock, port);

        for (const index of moves) {
            const row = Math.floor(index / 6);
            const col = index % 6;

            // Exactly what a real input frame does: turn a tap into a command, apply it,
            // then publish the state the renderer would draw.
            const x = layout.board.x + col * layout.board.cell + layout.board.cell / 2;
            const y = layout.board.y + row * layout.board.cell + layout.board.cell / 2;

            const command = hitTest(layout, x, y);
            assert.ok(command, 'the scripted tap must land on its own cell');
            round.handle(command);
            round.handle({ kind: 'pickShape', shape: solution[index] ?? 0 });
            void round.snapshot();

            frames += 2;
        }

        assert.equal(round.phase, 'won', 'every scripted playthrough must finish the board');
        finalScore = round.score;
    }
    const elapsed = performance.now() - started;

    const perFrameUs = (elapsed * 1000) / frames;
    assert.ok(
        perFrameUs < FRAME_BUDGET_US,
        `a logic frame averaged ${perFrameUs.toFixed(1)}µs over ${frames} frames ` +
            `(budget ${FRAME_BUDGET_US}µs, a 30 FPS frame is 33,300µs)`,
    );
    assert.ok(finalScore > 0, 'the benchmark round actually scored');
});

test('layout and hit-testing stay cheap enough to run on every resize', () => {
    const RUNS = 20_000;
    let sink = 0;

    const started = performance.now();
    for (let i = 0; i < RUNS; i++) {
        const layout = computeLayout({
            width: 320 + (i % 160),
            height: 480 + (i % 600),
            safeTop: i % 80,
            safeBottom: i % 40,
            gridSize: i % 2 === 0 ? 4 : 6,
            shapeCount: i % 2 === 0 ? 4 : 6,
        });
        const command = hitTest(layout, layout.board.x + 1, layout.board.y + 1);
        if (command) sink += 1;
    }
    const elapsed = performance.now() - started;

    const perCallUs = (elapsed * 1000) / RUNS;
    assert.ok(
        perCallUs < LAYOUT_BUDGET_US,
        `layout + hit test averaged ${perCallUs.toFixed(1)}µs over ${RUNS} calls (budget ${LAYOUT_BUDGET_US}µs)`,
    );
    assert.equal(sink, RUNS, 'every probe tap resolved to a cell, so the work was not optimised away');
});
