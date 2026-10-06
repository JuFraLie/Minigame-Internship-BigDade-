// input.test.ts — Unit tests for the renderer-free input modules (gesture
// maths and the shared input buffer).
// Runs headless using Node's native test runner (node --test --experimental-strip-types).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampToPlayfield, swipeDirection } from '../src/input/gestures.ts';
import { InputBuffer, NONE_DIRECTION, NONE_TAP } from '../src/input/inputBuffer.ts';

describe('Input — gesture maths', () => {
  describe('swipeDirection', () => {
    const THRESHOLD = 25;

    it('reports no turn while the drag stays inside the threshold', () => {
      assert.equal(swipeDirection(0, 0, THRESHOLD), null);
      assert.equal(swipeDirection(24, 24, THRESHOLD), null);
      assert.equal(swipeDirection(-24.9, 0, THRESHOLD), null);
    });

    it('reads the four cardinal drags', () => {
      assert.equal(swipeDirection(30, 0, THRESHOLD), 'right');
      assert.equal(swipeDirection(-30, 0, THRESHOLD), 'left');
      assert.equal(swipeDirection(0, 30, THRESHOLD), 'down');
      assert.equal(swipeDirection(0, -30, THRESHOLD), 'up');
    });

    it('turns the moment the threshold is crossed', () => {
      assert.equal(swipeDirection(25, 0, THRESHOLD), 'right');
      assert.equal(swipeDirection(0, -25, THRESHOLD), 'up');
    });

    it('resolves a diagonal to the dominant axis', () => {
      assert.equal(swipeDirection(40, 30, THRESHOLD), 'right');
      assert.equal(swipeDirection(-30, -45, THRESHOLD), 'up');
      assert.equal(swipeDirection(45, 30, THRESHOLD), 'right');
    });

    it('falls to the vertical axis on an exact tie', () => {
      assert.equal(swipeDirection(30, 30, THRESHOLD), 'down');
      assert.equal(swipeDirection(-30, -30, THRESHOLD), 'up');
    });
  });

  describe('clampToPlayfield', () => {
    it('leaves a point inside the playfield untouched', () => {
      assert.deepEqual(clampToPlayfield({ x: 10, y: 20 }, 360, 640), { x: 10, y: 20 });
    });

    it('pulls a point released past an edge back onto it', () => {
      assert.deepEqual(clampToPlayfield({ x: -40, y: -5 }, 360, 640), { x: 0, y: 0 });
      assert.deepEqual(clampToPlayfield({ x: 400, y: 700 }, 360, 640), { x: 360, y: 640 });
    });
  });
});

describe('Input — buffer ports', () => {
  it('hands back queued turns in order, then nothing', () => {
    const buffer = new InputBuffer();
    buffer.pushDirection('down');
    buffer.pushDirection('left');

    assert.equal(buffer.direction.consume(), 'down');
    assert.equal(buffer.direction.consume(), 'left');
    assert.equal(buffer.direction.consume(), null);
  });

  it('caps the queue at the two turns the snake can act on', () => {
    const buffer = new InputBuffer();
    buffer.pushDirection('up');
    buffer.pushDirection('right');
    buffer.pushDirection('down'); // Oldest turn is dropped, not the newest

    assert.equal(buffer.direction.consume(), 'right');
    assert.equal(buffer.direction.consume(), 'down');
    assert.equal(buffer.direction.consume(), null);
  });

  it('delivers a tap exactly once', () => {
    const buffer = new InputBuffer();
    buffer.pushTap({ x: 12, y: 34 });

    assert.deepEqual(buffer.taps.consume(), { x: 12, y: 34 });
    assert.equal(buffer.taps.consume(), null);
  });

  it('delivers a dash exactly once', () => {
    const buffer = new InputBuffer();
    buffer.pushDash();

    assert.equal(buffer.consumeDash(), true);
    assert.equal(buffer.consumeDash(), false);
  });

  it('exposes idle ports for screens that take no input', () => {
    assert.equal(NONE_DIRECTION.consume(), null);
    assert.equal(NONE_TAP.consume(), null);
  });
});
