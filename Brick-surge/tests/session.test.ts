/**
 * GameSession integration: the composed domain runs a round headless.
 *
 * Verifies the wiring between world, power-ups, DDA, score and the round
 * machine — things no single unit test covers.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { GameSession } from '../src/domain/GameSession.ts';
import { SeededRandom } from '../src/adapters/random/SeededRandom.ts';
import type { ClockPort, EventSinkPort } from '../src/domain/ports.ts';
import type { DomainEvent } from '../src/domain/types.ts';

class BenchClock implements ClockPort {
    ms = 0;
    now(): number { return this.ms; }
}

class Collector implements EventSinkPort {
    readonly events: DomainEvent[] = [];
    emit(e: DomainEvent): void { this.events.push(e); }
    count(type: DomainEvent['type']): number {
        return this.events.filter((e) => e.type === type).length;
    }
    last(type: DomainEvent['type']): DomainEvent | undefined {
        return [...this.events].reverse().find((e) => e.type === type);
    }
}

const setup = (): { session: GameSession; clock: BenchClock; sink: Collector } => {
    const clock = new BenchClock();
    const sink = new Collector();
    const session = new GameSession(new SeededRandom(99), clock, sink);
    session.start(210);
    return { session, clock, sink };
};

/** Advance the session in 60 fps steps, chasing the first ball with the paddle.
 *  The aim is deliberately a little off-centre — a player who always catches
 *  dead-centre would drive the ball perfectly vertical and stall the game. */
const run = (session: GameSession, clock: BenchClock, seconds: number): void => {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
        const snap = session.snapshot();
        if (snap.balls.length > 0) {
            const bias = Math.sin(i / 40) * 5; // weave under the ball
            session.setPaddleTargetX(snap.balls[0].x + bias);
        }
        clock.ms += 1000 / 60;
        session.update(1 / 60);
    }
};

describe('GameSession (headless)', () => {
    it('starts a round: serving, wave 1, live bricks', () => {
        const { session, sink } = setup();
        const snap = session.snapshot();
        assert.equal(snap.phase, 'serving');
        assert.equal(snap.wave, 1);
        assert.ok(snap.bricks.length > 0, 'wave 1 must have bricks');
        assert.equal(snap.lives, 3);
        assert.equal(sink.count('roundStarted'), 1);
    });

    it('serves the ball after the countdown and starts hitting bricks', () => {
        const { session, clock } = setup();
        run(session, clock, 3); // serve countdown is ~1.5 s
        const snap = session.snapshot();
        assert.equal(snap.phase, 'playing');
        assert.ok(snap.balls.length > 0, 'ball must be in play');
    });

    it('a bot that always catches eventually clears wave 1', () => {
        const { session, clock, sink } = setup();
        run(session, clock, 120);
        assert.ok(sink.count('waveCleared') >= 1, 'a perfect player must clear at least one wave');
    });

    it('losing happens when the paddle never moves', () => {
        const clock = new BenchClock();
        const sink = new Collector();
        const session = new GameSession(new SeededRandom(5), clock, sink);
        session.start(210);
        // Paddle stays centre; balls eventually drift past it.
        for (let i = 0; i < 60 * 300; i++) {
            clock.ms += 1000 / 60;
            session.update(1 / 60);
            if (sink.count('roundEnded') > 0) break;
        }
        assert.equal(sink.count('roundEnded'), 1, 'exactly one roundEnded');
        const end = sink.last('roundEnded');
        assert.ok(end && end.type === 'roundEnded');
        assert.equal(end.win, false, 'a passive player must eventually lose');
        assert.ok(end.score >= 0);
    });

    it('endRound is emitted exactly once, even across further updates', () => {
        const clock = new BenchClock();
        const sink = new Collector();
        const session = new GameSession(new SeededRandom(5), clock, sink);
        session.start(210);
        for (let i = 0; i < 60 * 300; i++) {
            clock.ms += 1000 / 60;
            session.update(1 / 60);
        }
        run(session, clock, 10); // keep ticking after the end
        assert.equal(sink.count('roundEnded'), 1);
    });

    it('world height follows the screen aspect ratio (tall phones get taller worlds)', () => {
        const { session } = setup();
        const snap = session.snapshot();
        // 100 wide; a 9:19.5 phone → height ≈ 210.
        assert.equal(snap.width, 100);
        assert.ok(snap.height > 150 && snap.height < 300);
    });

    it('paddle target is clamped to the world', () => {
        const { session, clock } = setup();
        session.setPaddleTargetX(-50);
        run(session, clock, 1);
        const left = session.snapshot().paddle;
        assert.ok(left.x >= left.w / 2, 'paddle must stay inside the left edge');

        session.setPaddleTargetX(500);
        run(session, clock, 1);
        const right = session.snapshot().paddle;
        assert.ok(right.x <= 100 - right.w / 2, 'paddle must stay inside the right edge');
    });
});
