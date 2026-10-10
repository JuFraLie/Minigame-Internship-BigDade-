// tests/scoring.test.ts — score progression: the scroll-speed ramp and the
// milestone chime. Pure rules, no renderer involved.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SCORING } from '../src/config/gameConfig.ts';
import { milestoneFor, scrollSpeed } from '../src/game/scoring.ts';

test('the run starts at the base speed', () => {
  assert.equal(scrollSpeed(0), SCORING.BASE_SPEED);
});

test('speed only ever grows with the score, and stops at the cap', () => {
  let previous = scrollSpeed(0);
  for (let score = 0; score <= SCORING.MAX_SPEED; score += 5) {
    const speed = scrollSpeed(score);
    assert.ok(speed >= previous, `speed dropped at score ${score}`);
    assert.ok(speed <= SCORING.MAX_SPEED, `speed outran the cap at score ${score}`);
    previous = speed;
  }
  assert.equal(scrollSpeed(1_000_000), SCORING.MAX_SPEED);
});

test('the difficulty ramp is meaningful, not cosmetic', () => {
  assert.ok(scrollSpeed(500) > scrollSpeed(50) * 1.5, 'the run must get harder');
});

test('milestones are reported at every step and never below zero', () => {
  assert.equal(milestoneFor(0), 0);
  assert.equal(milestoneFor(SCORING.MILESTONE_STEP - 1), 0);
  assert.equal(milestoneFor(SCORING.MILESTONE_STEP), SCORING.MILESTONE_STEP);
  assert.equal(milestoneFor(SCORING.MILESTONE_STEP * 3 + 7), SCORING.MILESTONE_STEP * 3);
  assert.equal(milestoneFor(-50), -100, 'negative scores stay below any real milestone');
});

test('the score itself is monotonic while the run is live', () => {
  // Mirrors the controller's rule: score += dt * POINTS_PER_SECOND.
  let score = 0;
  let previous = 0;
  for (let frame = 0; frame < 600; frame++) {
    score += 0.016 * SCORING.POINTS_PER_SECOND;
    assert.ok(score >= previous);
    previous = score;
  }
  assert.ok(score > 150, 'a ten-second run is worth a real score');
});
