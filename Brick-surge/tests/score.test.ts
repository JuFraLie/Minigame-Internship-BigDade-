/** ScoreSystem: combo multiplier and bonuses. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ScoreSystem } from '../src/domain/score/ScoreSystem.ts';
import { COMBO_MAX, POWERUP_POINTS, WAVE_BONUS_PER_BALL } from '../src/domain/config.ts';

describe('ScoreSystem', () => {
    it('starts at zero with a x1 multiplier', () => {
        const s = new ScoreSystem();
        assert.equal(s.score, 0);
        assert.equal(s.comboMultiplier, 1);
    });

    it('awards base points for the first brick', () => {
        const s = new ScoreSystem();
        s.onBrickHit();
        assert.equal(s.addBrick(10), 10);
        assert.equal(s.score, 10);
    });

    it('rises to x5 and stops (combo cap)', () => {
        const s = new ScoreSystem();
        for (let i = 0; i < 10; i++) { s.onBrickHit(); s.addBrick(10); }
        // Multipliers: 1,2,3,4,5 then x5 for the rest → 10 * (1+2+3+4+5+5+5+5+5+5) = 400
        assert.equal(s.score, 400);
        assert.equal(s.comboMultiplier, COMBO_MAX);
    });

    it('a damaged (not destroyed) sturdy brick still grows the combo', () => {
        const s = new ScoreSystem();
        s.onBrickHit(); // first hit on a 2-hp brick
        s.onBrickHit(); // second hit destroys it
        assert.equal(s.comboMultiplier, 2);
        assert.equal(s.addBrick(20), 40);
    });

    it('the paddle touch resets the combo', () => {
        const s = new ScoreSystem();
        s.onBrickHit(); s.addBrick(10);
        s.onBrickHit(); s.addBrick(10);
        assert.equal(s.comboMultiplier, 2);
        s.breakCombo();
        assert.equal(s.comboMultiplier, 1);
        s.onBrickHit();
        assert.equal(s.addBrick(10), 10);
    });

    it('power-up collection adds a flat 50', () => {
        const s = new ScoreSystem();
        s.addPowerUp();
        assert.equal(s.score, POWERUP_POINTS);
    });

    it('wave bonus is 100 per remaining ball', () => {
        const s = new ScoreSystem();
        assert.equal(s.addWaveBonus(3), 3 * WAVE_BONUS_PER_BALL);
        assert.equal(s.score, 300);
    });

    it('reset clears score and combo', () => {
        const s = new ScoreSystem();
        s.onBrickHit();
        s.addBrick(30);
        s.reset();
        assert.equal(s.score, 0);
        assert.equal(s.comboMultiplier, 1);
    });
});
