/**
 * Headless logic-performance benchmark (AGENTS.md §4.3 / §4.4).
 *
 * Runs thousands of fixed-timestep ticks of the full domain with no renderer
 * and reports the average time per tick. Catches logic-side regressions
 * without special hardware. The threshold is deliberately generous — it trips
 * on order-of-magnitude regressions, not noise.
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

const noopSink: EventSinkPort = { emit: (_e: DomainEvent) => {} };

describe('headless performance', () => {
    it('50000 ticks stay well under budget', () => {
        const clock = new BenchClock();
        const session = new GameSession(new SeededRandom(1234), clock, noopSink);
        session.start(210); // typical portrait world height

        // Keep the paddle chasing the ball with a slight weave, so bricks get
        // hit and the hot paths (collisions, drops, DDA) are exercised.
        let simMs = 0;
        let i = 0;
        const tick = (): void => {
            const snap = session.snapshot();
            const target = snap.balls.length > 0 ? snap.balls[0].x + Math.sin(i / 40) * 5 : 50;
            session.setPaddleTargetX(target);
            clock.ms = simMs;
            session.update(1 / 60);
            simMs += 1000 / 60;
            i++;
        };

        // Warm-up.
        for (let i = 0; i < 2000; i++) tick();

        const N = 50000;
        const start = process.hrtime.bigint();
        for (let i = 0; i < N; i++) tick();
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        const perTickUs = (elapsedMs * 1000) / N;

        console.log(`headless: ${N} ticks in ${elapsedMs.toFixed(1)} ms → ${perTickUs.toFixed(2)} µs/tick`);
        assert.ok(perTickUs < 200, `logic tick too slow: ${perTickUs.toFixed(2)} µs`);
    });
});
