import test from 'node:test';
import assert from 'node:assert/strict';

import { computePlayLayout } from '../src/adapters/phaser/layout.ts';
import { MAPS } from '../src/domain/maps.ts';
import { createScriptedBot, createWeakBot } from '../src/testing/bots.ts';
import { runLevel } from '../src/testing/headlessRunner.ts';

/**
 * Performance budgets (design document, performance section).
 *
 * The reference class is 4 GB RAM + MediaTek Helio G95, holding 30 FPS minimum and
 * ~50 FPS average; a simulation step has 33 ms of budget there and must use a small
 * fraction of it. These thresholds are deliberately generous for a modern dev machine —
 * they exist to catch a *regression* (an accidental allocation per enemy, a search per
 * frame), not to certify a specific device.
 */

test('a scripted level keeps every simulation step far below one frame', () => {
    const result = runLevel(1, createScriptedBot);

    assert.ok(result.steps > 0, 'the level never ran');
    assert.ok(
        result.msPerStep < 1,
        `a step averaged ${result.msPerStep.toFixed(4)} ms — the frame budget is 33 ms on the reference device`,
    );
});

test('the heavy waves of a deep level do not blow the step budget', () => {
    // Level 13 fields brutes and scaled-up HP: the busiest spawn list in a normal run.
    const result = runLevel(13, createScriptedBot, { maxSeconds: 120 });

    assert.ok(result.steps > 0, 'the level never ran');
    assert.ok(
        result.msPerStep < 1.5,
        `a step averaged ${result.msPerStep.toFixed(4)} ms with the heavy wave composition`,
    );
});

test('losing a level is no cheaper to simulate than winning one', () => {
    const result = runLevel(20, createWeakBot, { maxSeconds: 120 });

    assert.ok(result.steps > 0, 'the level never ran');
    assert.ok(result.msPerStep < 1.5, `a step averaged ${result.msPerStep.toFixed(4)} ms`);
});

test('a full layout pass is cheap enough to run on every resize event', () => {
    const input = { width: 390, height: 844, safeTop: 47, safeBottom: 34, spots: MAPS[0].spots };

    const started = performance.now();
    for (let i = 0; i < 5000; i++) computePlayLayout(input);
    const elapsed = performance.now() - started;

    assert.ok(elapsed < 500, `5000 layout passes took ${elapsed.toFixed(1)} ms`);
});
