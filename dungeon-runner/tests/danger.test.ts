// tests/danger.test.ts — the danger telegraph: it warns early, at the right
// lane, only for traps that are still off screen, with the same reaction
// window at every scroll speed.

import assert from 'node:assert/strict';
import test from 'node:test';

import { OBSTACLES } from '../src/config/gameConfig.ts';
import type { Obstacle } from '../src/game/obstacles.ts';
import { dangerMarkers } from '../src/render/warningView.ts';
import { makeLayout } from './helpers.ts';

const layout = makeLayout();
const gw = layout.gameW;
const floorY = layout.floorY();
const SPEED = 220; // reference scroll speed

const spike = (x: number): Obstacle => ({
  type: 'spike_cluster',
  x,
  active: true,
  spikeCount: 2,
  spikeH: 30,
});

const lowBat = (x: number): Obstacle => ({
  type: 'flyer',
  x,
  active: true,
  flyY: floorY - 55,
  flyPhase: 0,
});

const arrow = (x: number): Obstacle => ({
  type: 'arrow',
  x,
  active: true,
  arrowY: floorY - OBSTACLES.ARROW_Y_OFFSET,
});

/** One arrow stack: every arrow at the same x, each one step higher. */
const arrowStack = (x: number): Obstacle[] =>
  Array.from({ length: OBSTACLES.ARROW_COUNT }, (_, i) => ({
    type: 'arrow' as const,
    x,
    active: true,
    arrowY: floorY - (OBSTACLES.ARROW_Y_OFFSET + i * OBSTACLES.ARROW_STACK_SPACING),
  }));

test('a trap just off the right edge gets a marker in its own lane', () => {
  const markers = dangerMarkers([spike(gw + 20)], gw, floorY, SPEED);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].kind, 'spike_cluster');
  assert.equal(markers[0].y, floorY - 20, 'spikes warn at floor level');
});

test('the marker sits where the trap will actually threaten', () => {
  const [bat] = dangerMarkers([lowBat(gw + 20)], gw, floorY, SPEED);
  assert.equal(bat.kind, 'flyer');
  assert.equal(bat.y, floorY - 55 + OBSTACLES.BAT_CENTER_DY, 'bat lane = its body centre');

  const [arr] = dangerMarkers([arrow(gw + 20)], gw, floorY, SPEED);
  assert.equal(arr.kind, 'arrow');
  assert.equal(arr.y, floorY - OBSTACLES.ARROW_Y_OFFSET + OBSTACLES.ARROW_HIT_H / 2);
});

test('a trap already on screen needs no marker', () => {
  assert.deepEqual(dangerMarkers([spike(gw - 1)], gw, floorY, SPEED), []);
  assert.equal(dangerMarkers([arrow(gw)], gw, floorY, SPEED).length, 1, 'at the edge nothing is visible yet → still warns');
});

test('a trap beyond the lead distance stays quiet until it is close', () => {
  const lead = OBSTACLES.DANGER_LEAD_SECONDS * SPEED;
  assert.deepEqual(dangerMarkers([spike(gw + lead + 1)], gw, floorY, SPEED), []);
  assert.equal(dangerMarkers([spike(gw + lead)], gw, floorY, SPEED).length, 1, 'exactly at the lead still warns');
});

test('the lead is time-based: faster scroll = earlier warning', () => {
  const trap = spike(gw + 200);
  assert.deepEqual(dangerMarkers([trap], gw, floorY, SPEED), [], 'too early at crawl speed');
  assert.equal(dangerMarkers([trap], gw, floorY, 750).length, 1, 'same reaction window at top speed');
});

test('an incoming arrow stack warns once, at the centre of the wall', () => {
  const stack = arrowStack(gw + 20);
  const markers = dangerMarkers(stack, gw, floorY, SPEED);

  assert.equal(markers.length, 1, 'the whole stack is telegraphed by one marker');
  assert.equal(markers[0].kind, 'arrow');

  const lowest = floorY - OBSTACLES.ARROW_Y_OFFSET;
  const highest =
    floorY - (OBSTACLES.ARROW_Y_OFFSET + (OBSTACLES.ARROW_COUNT - 1) * OBSTACLES.ARROW_STACK_SPACING);
  assert.equal(
    markers[0].y,
    (lowest + highest + OBSTACLES.ARROW_HIT_H) / 2,
    'the marker sits in the middle of the stack it is warning about',
  );
});
