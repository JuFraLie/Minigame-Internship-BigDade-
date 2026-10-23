/** PowerUpSystem: weighted drops with a seeded RNG, ball cap, timer refresh. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { SeededRandom } from '../src/adapters/random/SeededRandom.ts';
import { PowerUpSystem } from '../src/domain/powerups/PowerUpSystem.ts';
import type { PowerUpKind } from '../src/domain/types.ts';

const paddle = { x: 50, y: 190, w: 16, h: 3 };

const collectKinds = (sys: PowerUpSystem, rolls: number, chance = 1, shrinkWeight = 2): PowerUpKind[] => {
    const kinds: PowerUpKind[] = [];
    sys.setEventListener((e) => { if (e.type === 'caught') kinds.push(e.kind); });
    for (let i = 0; i < rolls; i++) {
        sys.maybeSpawn(50, 100, chance, shrinkWeight);
        // Drop falls from y=100 to the paddle: enough ticks to be caught.
        for (let t = 0; t < 400; t++) sys.update(1 / 60, paddle, 200);
    }
    return kinds;
};

describe('PowerUpSystem drops', () => {
    it('never spawns at dropChance 0', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        const kinds = collectKinds(sys, 50, 0);
        assert.equal(kinds.length, 0);
    });

    it('spawns every brick at dropChance 1', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        const kinds = collectKinds(sys, 20, 1);
        assert.equal(kinds.length, 20);
    });

    it('is deterministic for the same seed', () => {
        const a = collectKinds(new PowerUpSystem(new SeededRandom(42)), 30);
        const b = collectKinds(new PowerUpSystem(new SeededRandom(42)), 30);
        assert.deepEqual(a, b);
    });

    it('respects weights: multi dominates over rare kinds', () => {
        const sys = new PowerUpSystem(new SeededRandom(7));
        const kinds = collectKinds(sys, 400);
        const count = (k: PowerUpKind): number => kinds.filter((x) => x === k).length;
        // multi (weight 55) must be the single most common drop — it is the
        // resource the whole game is built on.
        assert.ok(count('multi') > count('shrink') * 3);
        assert.ok(count('multi') >= count('wide'), 'multi at least ties any other kind');
    });

    it('never drops Shrink when its weight is 0 (the DDA struggling case)', () => {
        const sys = new PowerUpSystem(new SeededRandom(3));
        const kinds = collectKinds(sys, 200, 1, 0);
        assert.equal(kinds.includes('shrink'), false);
    });

    it('reports missed drops', () => {
        const sys = new PowerUpSystem(new SeededRandom(5));
        let missed = 0;
        sys.setEventListener((e) => { if (e.type === 'missed') missed++; });
        sys.maybeSpawn(50, 100, 1, 2);
        // Paddle far away at x=0; the drop falls past the floor.
        for (let t = 0; t < 600; t++) sys.update(1 / 60, { x: 0, y: 190, w: 4, h: 3 }, 200);
        assert.equal(missed, 1);
    });
});

describe('PowerUpSystem effects', () => {
    it('wide and shrink modify paddle width and expire', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        assert.equal(sys.paddleWidthMul(), 1);
        sys.apply('wide');
        assert.ok(sys.paddleWidthMul() > 1);
        for (let t = 0; t < 16 * 60; t++) sys.update(1 / 60, paddle, 200);
        assert.equal(sys.paddleWidthMul(), 1, 'wide must expire after 15 s');
    });

    it('collecting the same timed power-up refreshes, not stacks', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        sys.apply('wide');
        const first = sys.paddleWidthMul();
        sys.apply('wide');
        assert.equal(sys.paddleWidthMul(), first, 'no stacking');
    });

    it('shrink narrows the paddle', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        sys.apply('shrink');
        assert.ok(sys.paddleWidthMul() < 1);
    });

    it('slow ball halves-ish speed and expires after 12 s', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        sys.apply('slow');
        assert.ok(sys.ballSpeedMul() < 1);
        for (let t = 0; t < 13 * 60; t++) sys.update(1 / 60, paddle, 200);
        assert.equal(sys.ballSpeedMul(), 1);
    });

    it('fireball is active for 8 s', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        sys.apply('fire');
        assert.equal(sys.isFireball(), true);
        for (let t = 0; t < 9 * 60; t++) sys.update(1 / 60, paddle, 200);
        assert.equal(sys.isFireball(), false);
    });

    it('shield saves exactly one ball', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        assert.equal(sys.consumeShield(), false);
        sys.apply('shield');
        assert.equal(sys.consumeShield(), true);
        assert.equal(sys.consumeShield(), false, 'shield is one-time');
    });
});

describe('PowerUpSystem multi-ball', () => {
    it('spawns exactly one extra ball, fanned from the paddle', () => {
        const sys = new PowerUpSystem(new SeededRandom(1));
        const spawn = sys.multiSpawn(paddle, 95, 0);
        assert.equal(spawn.r > 0, true);
        assert.equal(spawn.vy < 0, true, 'the new ball launches upward');
        // Fan index moves the spawn off dead-centre so it does not shadow an
        // existing ball on the very first bounce.
        const other = sys.multiSpawn(paddle, 95, 2);
        assert.notEqual(spawn.vx, other.vx);
    });
});
