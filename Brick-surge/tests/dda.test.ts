/** DdaController: signals -> skill score -> difficulty level, with guards. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DdaController, paramsForLevel, MIN_LEVEL, MAX_LEVEL } from '../src/domain/dda/DdaController.ts';
import type { ClockPort } from '../src/domain/ports.ts';

/** A controllable clock so tests can step time precisely. */
class FakeClock implements ClockPort {
    ms = 0;
    now(): number { return this.ms; }
    advance(seconds: number): void { this.ms += seconds * 1000; }
}

const makeDda = (): { dda: DdaController; clock: FakeClock } => {
    const clock = new FakeClock();
    return { dda: new DdaController(clock, 8000), clock };
};

/** Drive the DDA forward past the 8 s cooldown, one step per call. */
const settle = (dda: DdaController, clock: FakeClock, steps = 10): void => {
    for (let i = 0; i < steps; i++) {
        clock.advance(9);
        dda.update();
    }
};

describe('DdaController basics', () => {
    it('starts neutral', () => {
        const { dda } = makeDda();
        assert.equal(dda.skillScore, 0.5);
        assert.equal(dda.difficultyLevel, 0);
    });

    it('maps levels to the design parameter table', () => {
        assert.equal(paramsForLevel(0).ballSpeedMul, 1);
        assert.ok(paramsForLevel(-3).ballSpeedMul < 1);
        assert.ok(paramsForLevel(3).ballSpeedMul > 1);
        assert.ok(paramsForLevel(-3).paddleWidthMul > 1);
        assert.ok(paramsForLevel(3).paddleWidthMul < 1);
        assert.ok(paramsForLevel(-3).dropChance > paramsForLevel(3).dropChance);
        assert.equal(paramsForLevel(-3).shrinkWeight, 0);
        assert.equal(paramsForLevel(3).shrinkWeight, 3);
        assert.ok(paramsForLevel(-3).serveSeconds > paramsForLevel(3).serveSeconds);
        assert.ok(paramsForLevel(-3).brickToughShareMul < 1);
        assert.ok(paramsForLevel(3).brickToughShareMul > 1);
    });
});

describe('DdaController struggle eases the game', () => {
    it('repeated life losses lower the skill score', () => {
        const { dda } = makeDda();
        const before = dda.skillScore;
        for (let i = 0; i < 5; i++) dda.onLifeLost();
        assert.ok(dda.skillScore < before);
    });

    it('sustained struggle reaches the easiest level and stops at the cap', () => {
        const { dda, clock } = makeDda();
        for (let i = 0; i < 40; i++) {
            dda.onLifeLost();
            dda.onNearMiss();
            settle(dda, clock, 1);
        }
        assert.equal(dda.difficultyLevel, MIN_LEVEL, 'struggle must reach -3');
        assert.equal(dda.difficultyLevel, Math.max(MIN_LEVEL, dda.difficultyLevel), 'cap holds');
    });

    it('a SINGLE life loss must NOT change the level (anti-exploit)', () => {
        const { dda, clock } = makeDda();
        dda.onLifeLost();
        settle(dda, clock, 5);
        assert.equal(dda.difficultyLevel, 0, 'one death alone must not ease the game');
    });
});

describe('DdaController dominance raises difficulty', () => {
    it('fast brick rallies and wave clears raise the skill score', () => {
        const { dda } = makeDda();
        const before = dda.skillScore;
        for (let i = 0; i < 30; i++) dda.onRally(0.5);
        assert.ok(dda.skillScore > before);
    });

    it('sustained domination reaches the hardest level and stops at the cap', () => {
        const { dda, clock } = makeDda();
        for (let i = 0; i < 40; i++) {
            dda.onRally(0.5);
            dda.onCleanBrick();
            dda.onWaveCleared(45, 20); // far faster than target
            dda.onDropResult(true);
            settle(dda, clock, 1);
        }
        assert.equal(dda.difficultyLevel, MAX_LEVEL);
    });
});

describe('DdaController guards', () => {
    it('never steps more than once per cooldown window', () => {
        const { dda, clock } = makeDda();
        for (let i = 0; i < 20; i++) dda.onLifeLost();
        // Two updates back-to-back with no time passing: only one step allowed.
        dda.update();
        const afterFirst = dda.difficultyLevel;
        dda.update();
        assert.equal(dda.difficultyLevel, afterFirst, 'no step without cooldown elapsed');
        // 7 s later — still inside the 8 s window.
        clock.advance(7);
        dda.update();
        assert.equal(dda.difficultyLevel, afterFirst, 'still cooling down at 7 s');
        // 9 s later — a step is allowed.
        clock.advance(2);
        dda.update();
        assert.ok(Math.abs(dda.difficultyLevel - afterFirst) === 1, 'exactly one step after cooldown');
    });

    it('never steps more than one level at a time', () => {
        const { dda, clock } = makeDda();
        for (let i = 0; i < 50; i++) dda.onLifeLost();
        const before = dda.difficultyLevel;
        clock.advance(9);
        dda.update();
        assert.ok(Math.abs(dda.difficultyLevel - before) <= 1, 'one step max');
    });

    it('hysteresis: S crossing a level boundary by a hair does NOT move D', () => {
        const { dda, clock } = makeDda();
        // One life lost + one missed drop lands S just past the -1 boundary
        // (centre ≈ -0.6) but inside the hysteresis band — D must hold at 0.
        dda.onLifeLost();
        dda.onDropResult(false);
        settle(dda, clock, 3);
        assert.equal(dda.skillScore < 0.5, true, 'S should have dropped');
        assert.equal(dda.difficultyLevel, 0, 'hysteresis must hold D at 0');

        // A little further down, past the band, the step is finally taken.
        dda.onLifeLost();
        dda.onDropResult(false);
        settle(dda, clock, 3);
        assert.equal(dda.difficultyLevel, -1, 'past the band D must step down');
    });

    it('slow waves are a struggle signal, fast waves a dominance signal', () => {
        const { dda } = makeDda();
        const before = dda.skillScore;
        dda.onWaveCleared(45, 90); // twice the target time
        assert.ok(dda.skillScore < before, 'slow clear must lower S');
    });
});
