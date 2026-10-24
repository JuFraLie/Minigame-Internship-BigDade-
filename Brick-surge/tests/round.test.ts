/** RoundStateMachine: endless waves, lose, and endRound emitted exactly once. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { RoundStateMachine } from '../src/domain/round/RoundStateMachine.ts';
import type { ClockPort } from '../src/domain/ports.ts';

class FakeClock implements ClockPort {
    ms = 0;
    now(): number { return this.ms; }
    advance(seconds: number): void { this.ms += seconds * 1000; }
}

const makeRound = (banner = 1): { round: RoundStateMachine; clock: FakeClock } => {
    const clock = new FakeClock();
    return { round: new RoundStateMachine(clock, banner), clock };
};

/** Tick until the serving/banner countdown expires. */
const tickUntilIdle = (round: RoundStateMachine, clock: FakeClock): void => {
    for (let i = 0; i < 10; i++) {
        clock.advance(0.5);
        const signals = round.update();
        void signals;
    }
};

describe('RoundStateMachine', () => {
    it('starts serving wave 1', () => {
        const { round } = makeRound();
        const signals = round.start(1.5);
        assert.deepEqual(signals, [{ type: 'roundStarted', wave: 1 }]);
        assert.equal(round.phase, 'serving');
        assert.equal(round.wave, 1);
    });

    it('serving countdown expires into playing', () => {
        const { round, clock } = makeRound();
        round.start(1.5);
        tickUntilIdle(round, clock);
        assert.equal(round.phase, 'playing');
    });

    it('clearing wave 1 shows the banner and then starts wave 2', () => {
        const { round, clock } = makeRound();
        round.start(1.5);
        tickUntilIdle(round, clock);

        const banner = round.waveCleared();
        assert.deepEqual(banner, [{ type: 'waveBanner', wave: 2 }]);
        assert.equal(round.phase, 'banner');

        tickUntilIdle(round, clock);
        assert.equal(round.phase, 'playing');
        assert.equal(round.wave, 2);
    });

    it('is endless: waves advance forever, no wave ever ends the run', () => {
        const { round, clock } = makeRound();
        round.start(1.5);
        // Clear ten waves in a row — the machine must happily keep counting up.
        for (let wave = 1; wave <= 10; wave++) {
            tickUntilIdle(round, clock);
            const signals = round.waveCleared();
            assert.equal(signals.some((s) => s.type === 'waveBanner'), true,
                `wave ${wave} must show a banner for the next one`);
            assert.equal(signals.some((s) => s.type === 'roundEnded'), false);
            tickUntilIdle(round, clock);
            assert.equal(round.phase, 'playing');
            assert.equal(round.wave, wave + 1);
        }
    });

    it('losing the last ball ends the run at the current wave', () => {
        const { round, clock } = makeRound();
        round.start(1.5);
        tickUntilIdle(round, clock);
        const signals = round.lost();
        assert.deepEqual(signals, [{ type: 'roundEnded', wave: 1 }]);
        assert.equal(round.phase, 'ended');
    });

    it('endRound is emitted exactly once even if called repeatedly', () => {
        const { round, clock } = makeRound();
        round.start(1.5);
        tickUntilIdle(round, clock);
        assert.equal(round.lost().length, 1);
        assert.equal(round.lost().length, 0, 'second call emits nothing');
        assert.equal(round.lost().length, 0);
        // Nor can a later win overwrite the loss.
        assert.equal(round.waveCleared().length, 0);
    });

    it('ignores signals once the round has ended', () => {
        const { round, clock } = makeRound();
        round.start(1.5);
        tickUntilIdle(round, clock);
        round.lost();
        assert.equal(round.waveCleared().length, 0);
        assert.equal(round.phase, 'ended');
        tickUntilIdle(round, clock);
        assert.equal(round.phase, 'ended', 'countdown must not revive an ended round');
    });
});
