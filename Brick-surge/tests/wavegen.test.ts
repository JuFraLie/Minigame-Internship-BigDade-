/** WaveGenerator: templates, brick caps, and the DDA-driven HP mix. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { SeededRandom } from '../src/adapters/random/SeededRandom.ts';
import { WaveGenerator } from '../src/domain/bricks/WaveGenerator.ts';
import { MAX_BRICKS, MAX_WAVE_ROWS, WORLD_WIDTH } from '../src/domain/config.ts';
import { rowsForWave } from '../src/domain/bricks/WaveGenerator.ts';

const HEIGHT = 210;

const share = (wave: number, mul: number, seed: number): { tough: number; sturdy: number; basic: number; total: number } => {
    const gen = new WaveGenerator(new SeededRandom(seed));
    const bricks = gen.generate(wave, HEIGHT, mul);
    const tough = bricks.filter((b) => b.kind === 'tough').length;
    const sturdy = bricks.filter((b) => b.kind === 'sturdy').length;
    const basic = bricks.filter((b) => b.kind === 'basic').length;
    return { tough, sturdy, basic, total: bricks.length };
};

describe('WaveGenerator', () => {
    it('produces bricks inside the world and under the cap', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const gen = new WaveGenerator(new SeededRandom(seed));
            for (const wave of [1, 2, 3, 8, 25]) {
                const bricks = gen.generate(wave, HEIGHT, 1);
                assert.ok(bricks.length > 0, `wave ${wave} must not be empty`);
                assert.ok(bricks.length <= MAX_BRICKS);
                for (const b of bricks) {
                    assert.ok(b.x > 0 && b.x < WORLD_WIDTH, 'brick inside world width');
                    assert.ok(b.y > 0 && b.y < HEIGHT, 'brick inside world height');
                    assert.ok(b.hp >= 1 && b.hp <= 3);
                }
            }
        }
    });

    it('endless waves get denser, then cap at MAX_WAVE_ROWS', () => {
        assert.equal(rowsForWave(1), 6, 'wave 1 is dense from the start');
        assert.ok(rowsForWave(2) > rowsForWave(1));
        assert.ok(rowsForWave(3) > rowsForWave(2));
        // Endless: one extra row per wave past the opening trio...
        assert.equal(rowsForWave(4), rowsForWave(3) + 1);
        assert.equal(rowsForWave(5), rowsForWave(4) + 1);
        // ...until the cap, which holds for any wave number the run can reach.
        for (const wave of [7, 20, 100, 9999]) {
            assert.equal(rowsForWave(wave), MAX_WAVE_ROWS, `wave ${wave} must cap`);
        }
        // Monotonic: the field never gets smaller as the run goes on.
        let prev = 0;
        for (let w = 1; w <= 30; w++) {
            assert.ok(rowsForWave(w) >= prev, `wave ${w} must not shrink the field`);
            prev = rowsForWave(w);
        }
    });

    it('never places Tough bricks in wave 1', () => {
        for (const seed of [1, 7, 13, 99]) {
            assert.equal(share(1, 1, seed).tough, 0, `seed ${seed} leaked tough bricks into wave 1`);
        }
    });

    it('places Tough bricks from wave 2 on', () => {
        let tough = 0;
        for (let seed = 1; seed <= 30; seed++) tough += share(2, 3, seed).tough;
        assert.ok(tough > 0, 'wave 2 must contain some tough bricks');
    });

    it('the DDA multiplier raises the non-basic share of the next wave', () => {
        const easyTotals = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
            const r = share(3, 0.7, s);
            return (r.tough + r.sturdy) / r.total;
        });
        const hardTotals = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
            const r = share(3, 1.3, s);
            return (r.tough + r.sturdy) / r.total;
        });
        const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
        assert.ok(avg(hardTotals) > avg(easyTotals), 'harder waves must have more sturdy/tough bricks');
    });

    it('is deterministic for the same seed', () => {
        const a = new WaveGenerator(new SeededRandom(42)).generate(2, HEIGHT, 1);
        const b = new WaveGenerator(new SeededRandom(42)).generate(2, HEIGHT, 1);
        assert.deepEqual(a, b);
    });

    it('gives each wave a different layout (templates are picked randomly)', () => {
        const layouts = new Set<string>();
        const gen = new WaveGenerator(new SeededRandom(5));
        for (let i = 0; i < 6; i++) {
            const bricks = gen.generate(2, HEIGHT, 1);
            layouts.add(bricks.map((b) => `${b.x},${b.y}`).join('|'));
        }
        assert.ok(layouts.size > 1, 'templates must vary between waves');
    });
});
