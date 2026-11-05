import test from 'node:test';
import assert from 'node:assert/strict';

import { GRID_4, cellIndex } from '../src/domain/Board.ts';
import { RoundState, configForLevel } from '../src/domain/RoundState.ts';
import type { RoundEvent } from '../src/domain/ports.ts';
import { boardFrom, fakeClock, recorder, solve, TRAP_4 } from './helpers.ts';

/** One cell short of finished: filling (0,0) with 0 wins the round outright. */
const ONE_AWAY = [
    [null, 1, 2, 3],
    [2, 3, 0, 1],
    [1, 0, 3, 2],
    [3, 2, 1, 0],
];

function roundOneAway(): { round: RoundState; events: RoundEvent[]; clock: ReturnType<typeof fakeClock> } {
    const clock = fakeClock(1_000);
    const { events, port } = recorder<RoundEvent>();
    const config = configForLevel(1);
    const round = new RoundState(config, boardFrom(GRID_4, ONE_AWAY), clock, port);
    return { round, events, clock };
}

test('a round starts playing, with three hearts and an untouched streak', () => {
    const { round } = roundOneAway();
    assert.equal(round.phase, 'playing');
    assert.equal(round.hearts, 3);
    assert.equal(round.score, 0);
    assert.equal(round.snapshot().streak, 0);
});

test('selecting an open cell announces it; selecting a locked cell changes nothing', () => {
    const { round, events } = roundOneAway();

    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    assert.deepEqual(events[events.length - 1], { type: 'selected', index: 0 });
    assert.equal(round.snapshot().selected, 0);

    events.length = 0;
    // (1,0) already holds a 2, so it is locked and must not become the selection.
    round.handle({ kind: 'selectCell', row: 1, col: 0 });
    assert.equal(events.length, 0);
    assert.equal(round.snapshot().selected, 0, 'the previous selection survives');
});

test('picking a shape with nothing selected does nothing at all', () => {
    const { round, events } = roundOneAway();
    round.handle({ kind: 'pickShape', shape: 0 });
    assert.equal(events.length, 0);
    assert.equal(round.score, 0);
});

test('a correct placement pays out, locks in and empties the selection', () => {
    const { round, events } = roundOneAway();

    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    round.handle({ kind: 'pickShape', shape: 0 });

    const correct = events.find(
        (event): event is Extract<RoundEvent, { type: 'correct' }> => event.type === 'correct',
    );
    assert.ok(correct);
    assert.equal(correct.index, 0);
    assert.equal(correct.gained, 100);
    assert.equal(correct.multiplier, 1);

    assert.equal(round.snapshot().selected, null, 'the cell is filled, so nothing is selected');
    assert.equal(round.board.cells[cellIndex(4, 0, 0)], 0);
});

test('three mistakes take every heart and end the round as a loss', () => {
    const { round, events } = roundOneAway();
    round.handle({ kind: 'selectCell', row: 0, col: 0 });

    // Row 0 already holds 1, 2 and 3, so each of them is a mistake.
    for (const shape of [1, 2, 3]) round.handle({ kind: 'pickShape', shape });

    const wrong = events.filter(
        (event): event is Extract<RoundEvent, { type: 'wrong' }> => event.type === 'wrong',
    );
    assert.equal(wrong.length, 3);
    assert.deepEqual(wrong.map((event) => event.hearts), [2, 1, 0]);

    assert.equal(round.phase, 'lost');
    assert.equal(round.score, 0, 'three failures at −50 floor at zero');
    assert.equal(events.filter((event) => event.type === 'lost').length, 1, 'the loss is announced once');
});

test('the cell stays selected after a miss, so only a new shape is needed', () => {
    const { round } = roundOneAway();
    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    round.handle({ kind: 'pickShape', shape: 3 });

    assert.equal(round.snapshot().selected, 0, 'the shape popped back out, but the cell remains chosen');
    assert.equal(round.hearts, 2);
});

test('commands after the round ends are ignored', () => {
    const { round, events } = roundOneAway();
    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    for (const shape of [1, 2, 3]) round.handle({ kind: 'pickShape', shape });
    assert.equal(round.phase, 'lost');

    events.length = 0;
    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    round.handle({ kind: 'pickShape', shape: 0 });
    assert.equal(events.length, 0, 'a finished round takes no further input');
});

test('the final fill wins, and pays line bonuses plus the time bonus', () => {
    const { round, events } = roundOneAway();

    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    round.handle({ kind: 'pickShape', shape: 0 });

    assert.equal(round.phase, 'won');
    assert.equal(events[events.length - 1]?.type, 'won', 'the win is the last thing announced');

    const lines = events.find(
        (event): event is Extract<RoundEvent, { type: 'linesCompleted' }> => event.type === 'linesCompleted',
    );
    assert.ok(lines);
    assert.equal(lines.lines.length, 3, 'row 0, column 0 and box 0 all closed together');
    assert.equal(lines.bonus, 450);

    const timeBonus = events.find(
        (event): event is Extract<RoundEvent, { type: 'timeBonus' }> => event.type === 'timeBonus',
    );
    assert.ok(timeBonus);
    assert.equal(timeBonus.bonus, 450, 'level 1 par is 90s, and nothing was spent');

    // 100 for the fill + 450 for three lines + 450 for the clock.
    assert.equal(round.score, 1000);
});

test('the time bonus shrinks as the clock runs down', () => {
    const fast = roundOneAway();
    fast.round.handle({ kind: 'selectCell', row: 0, col: 0 });
    fast.round.handle({ kind: 'pickShape', shape: 0 });

    const slow = roundOneAway();
    slow.clock.advance(30_000);
    slow.round.handle({ kind: 'selectCell', row: 0, col: 0 });
    slow.round.handle({ kind: 'pickShape', shape: 0 });

    assert.ok(slow.round.score < fast.round.score, 'half the par spent, half the bonus gone');
    assert.equal(fast.round.score - slow.round.score, 150, '30s × 5 points');
});

test('the tray reports how many of each shape are still needed', () => {
    const { round } = roundOneAway();
    const before = round.snapshot().tray;
    assert.equal(before.length, 4, 'a 4x4 plays with four shapes');
    assert.equal(
        before.reduce((sum, count) => sum + count, 0),
        1,
        'exactly one shape is still missing from the board',
    );

    round.handle({ kind: 'selectCell', row: 0, col: 0 });
    round.handle({ kind: 'pickShape', shape: 0 });

    const after = round.snapshot().tray;
    assert.equal(after[0], 0, 'shape 0 is now complete');
    assert.equal(after.reduce((sum, count) => sum + count, 0), 0, 'the finished board needs nothing');
});

test('a level 1 round generated from a seed can be replayed exactly', () => {
    const clock = fakeClock();
    const build = (): RoundState => {
        const { port } = recorder<RoundEvent>();
        return RoundState.create(1, 987654, clock, port);
    };

    const first = build();
    const second = build();
    assert.deepEqual(first.board.cells, second.board.cells, 'Retry must replay the same puzzle');
    assert.deepEqual(first.board.givens, second.board.givens);

    const nextLevel = RoundState.create(4, 987654, clock, recorder<RoundEvent>().port);
    assert.equal(nextLevel.board.size.size, 6, 'level 4 moves to the six-by-six');
});

test('a round tracks its own elapsed time through the clock port', () => {
    const clock = fakeClock(5_000);
    const { port } = recorder<RoundEvent>();
    const round = new RoundState(configForLevel(1), boardFrom(GRID_4, ONE_AWAY), clock, port);

    assert.equal(round.elapsedSeconds(), 0);
    clock.advance(12_500);
    assert.equal(round.elapsedSeconds(), 12.5);
    assert.equal(round.snapshot().secondsLeft, 77.5, '90s par minus 12.5s spent');
});

test('a pick that would strand the round is refused, and the round still finishes', () => {
    const clock = fakeClock(1_000);
    const { events, port } = recorder<RoundEvent>();
    const round = new RoundState(configForLevel(1), boardFrom(GRID_4, TRAP_4), clock, port);

    // A 0 at (0,1) collides with nothing anywhere on the board — and leaves a grid that
    // can never be completed, which with no time limit would strand the player forever.
    round.handle({ kind: 'selectCell', row: 0, col: 1 });
    round.handle({ kind: 'pickShape', shape: 0 });

    assert.ok(events.some((event) => event.type === 'wrong'), 'it must be scored as a mistake');
    assert.equal(round.hearts, 2, 'the mistake costs a heart');
    assert.equal(round.board.cells[1], null, 'nothing was written into the cell');
    assert.equal(round.snapshot().selected, 1, 'the cell stays selected for the real answer');
    assert.equal(round.phase, 'playing', 'one mistake does not end the round');

    // The proof the refusal was survivable: play the real solution through and win.
    const solution = solve(round.board);
    assert.ok(solution.length > 0, 'the puzzle must still be solvable afterwards');
    for (let index = 0; index < solution.length; index++) {
        if (round.board.cells[index] !== null) continue;
        round.handle({ kind: 'selectCell', row: Math.floor(index / 4), col: index % 4 });
        round.handle({ kind: 'pickShape', shape: solution[index] ?? 0 });
    }

    assert.equal(round.phase, 'won', 'the round is still possible to complete');
});
