import test from 'node:test';
import assert from 'node:assert/strict';

import { createScriptedBot, createWeakBot } from '../src/testing/bots.ts';
import { runLevel, runLevels } from '../src/testing/headlessRunner.ts';

/**
 * Bot smoke tests: the reference player must actually clear the opening levels, and an
 * unprepared defence must actually lose a deep one. Both prove the balance is real —
 * a game nobody can win (or nobody can lose) fails the design document's test plan.
 */

test('the scripted bot clears level 1 with lives to spare', () => {
    const result = runLevel(1, createScriptedBot(6));

    assert.equal(result.outcome, 'victory', `bot reached wave state with ${result.score} score`);
    assert.equal(result.wavesCleared, 3, 'all three waves must be cleared');
    assert.ok(result.lives > 0, `bot finished with ${result.lives} lives`);
    assert.ok(result.score > 0, 'a cleared level must score');
    assert.ok(result.gold >= 0);
});

test('the scripted bot clears level 2 as well', () => {
    const result = runLevel(2, createScriptedBot(8));
    assert.equal(result.outcome, 'victory');
    assert.equal(result.wavesCleared, 3);
});

test('bot runs are deterministic — same level, same result', () => {
    const first = runLevel(3, createScriptedBot(7));
    const second = runLevel(3, createScriptedBot(7));

    assert.equal(first.outcome, second.outcome);
    assert.equal(first.score, second.score);
    assert.equal(first.lives, second.lives);
    assert.equal(first.gold, second.gold);
    assert.equal(first.steps, second.steps);
});

test('an unprepared defence loses a deep level', () => {
    const result = runLevel(20, createWeakBot(), { maxSeconds: 600 });

    assert.equal(result.outcome, 'defeat', 'one dart tower cannot hold level 20');
    assert.ok(result.lives <= 0);
    assert.ok(result.wavesCleared < 3, 'a loss must happen before the level is cleared');
});

test('running a range of levels keeps every result inside the runner contract', () => {
    const results = runLevels(1, 3, (spotCount) => createScriptedBot(spotCount), [6, 8, 7]);

    assert.equal(results.length, 3);
    for (const result of results) {
        assert.ok(result.steps > 0 && result.seconds > 0, `level ${result.level} never ran`);
        assert.ok(result.score >= 0 && result.gold >= 0);
        assert.ok(['victory', 'defeat'].includes(result.outcome));
    }
});
