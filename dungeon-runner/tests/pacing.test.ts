// tests/pacing.test.ts — the difficulty scaling loop, headless (AGENTS.md §4.3):
// phases are a pure function of the score, the burst → recovery rhythm is a
// fixed schedule, and a phase only ever offers what it has unlocked.

import assert from 'node:assert/strict';
import test from 'node:test';

import { OBSTACLES } from '../src/config/gameConfig.ts';
import { ObstacleSpawner } from '../src/game/obstacles.ts';
import {
  PHASES,
  phaseFor,
  pickSpikeCount,
  pickSpikeHeight,
  pickTrap,
  spawnInterval,
  unlockScore,
} from '../src/game/pacing.ts';
import { makeLayout } from './helpers.ts';

const layout = makeLayout();
const floorY = layout.floorY();
const DT = 0.016;

/** Deterministic Math.random stand-in, so "the same rolls" is testable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Runs the real spawner for `seconds` and logs what it sent, one entry per spawn. */
function spawnLog(score: number, seconds: number, seed: number): string[] {
  const original = Math.random;
  Math.random = lcg(seed);
  try {
    const spawner = new ObstacleSpawner();
    const log: string[] = [];
    for (let t = 0; t < seconds; t += DT) {
      spawner.update(DT, score, layout.gameW, floorY);
      for (const obs of spawner.obstacles) {
        if (obs.type === 'arrow') log.push('arrow');
        else if (obs.type === 'flyer') log.push('flyer');
        else log.push(`spike:${obs.spikeCount}:${Math.round(obs.spikeH ?? 0)}`);
      }
      spawner.obstacles.length = 0;
    }
    return log;
  } finally {
    Math.random = original;
  }
}

test('the phase is a pure function of the score — the timeline never bends', () => {
  assert.equal(phaseFor(0), PHASES[0], 'a fresh run opens in the first phase');
  assert.equal(phaseFor(500_000), PHASES[PHASES.length - 1], 'the last phase tops out and stays');

  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    assert.equal(phaseFor(phase.fromScore), phase, `${phase.name} starts exactly at its score`);

    const next = PHASES[i + 1];
    if (next) {
      assert.equal(
        phaseFor(next.fromScore - 1),
        phase,
        `${phase.name} owns everything up to ${next.name}`,
      );
      assert.equal(phaseFor(next.fromScore), next, `${next.name} takes over at its own score`);
    }
  }
});

test('a trap is offered only from the phase that unlocks it', () => {
  assert.equal(unlockScore('spike_cluster'), 0, 'the floor is there from the first step');
  assert.equal(unlockScore('arrow'), 100, 'the shield lesson arrives second');
  assert.equal(unlockScore('flyer'), 200, 'the bat arrives third');

  // The menus may only ever grow: once unlocked, a trap stays unlocked.
  const seen = new Set<string>();
  for (const phase of PHASES) {
    for (const trap of phase.traps) {
      assert.ok(
        unlockScore(trap) <= phase.fromScore,
        `${trap} must be unlocked before ${phase.name} offers it`,
      );
      seen.add(trap);
    }
  }
  assert.equal(seen.size, 3, 'all three traps end up in rotation');
});

test('every phase is harder than the one before it', () => {
  for (let i = 1; i < PHASES.length; i++) {
    const prev = PHASES[i - 1];
    const phase = PHASES[i];

    assert.ok(phase.intervalMin <= prev.intervalMin, `${phase.name} spawns at least as often`);
    assert.ok(phase.intervalMax <= prev.intervalMax, `${phase.name} caps its gaps tighter`);
    assert.ok(phase.burst >= prev.burst, `${phase.name} runs longer bursts`);
    assert.ok(phase.rest <= prev.rest, `${phase.name} recovers no longer than ${prev.name}`);
    assert.ok(phase.spikes.length > 0 && prev.spikes.length > 0);
    assert.ok(
      Math.max(...phase.spikes) >= Math.max(...prev.spikes),
      `${phase.name} allows at least as wide a cluster`,
    );
    assert.ok(phase.spikeHVar >= prev.spikeHVar, `${phase.name} lets spikes grow taller`);
  }
});

test('the loop breathes: the recovery gap opens on every burst, and only there', () => {
  for (const phase of PHASES) {
    const base = (roll: number): number =>
      phase.intervalMin + roll * (phase.intervalMax - phase.intervalMin);

    for (let i = 0; i < phase.burst * 3; i++) {
      const gap = spawnInterval(phase, i, 0.5);
      const opensBurst = i > 0 && i % phase.burst === 0;
      const expected = opensBurst ? base(0.5) + phase.rest : base(0.5);

      assert.ok(
        Math.abs(gap - expected) < 1e-9,
        `${phase.name}: gap ${i} must be ${opensBurst ? 'a recovery' : 'in-burst'}`,
      );
      if (opensBurst) {
        assert.ok(gap > spawnInterval(phase, i - 1, 0.5), 'the recovery is the long gap');
      }
    }
  }
});

test('a roll only ever picks from the phase menu — never the timing or the size', () => {
  for (const phase of PHASES) {
    for (let roll = -0.5; roll <= 1.5; roll += 0.05) {
      const trap = pickTrap(phase, roll);
      assert.ok(phase.traps.includes(trap), `${roll} offered ${trap} outside the ${phase.name} menu`);

      const count = pickSpikeCount(phase, roll);
      assert.ok(
        phase.spikes.includes(count),
        `${roll} offered a ${count}-spike cluster ${phase.name} never allows`,
      );

      const h = pickSpikeHeight(phase, roll);
      assert.ok(h >= OBSTACLES.SPIKE_H_BASE, 'height never drops below the base spike');
      assert.ok(
        h <= OBSTACLES.SPIKE_H_BASE + phase.spikeHVar,
        'height never exceeds what the phase allows',
      );
    }
  }
});

test('gaps always stay inside the phase band', () => {
  for (const phase of PHASES) {
    for (const roll of [0, 0.37, 0.999]) {
      const gap = spawnInterval(phase, 1, roll); // index 1 is never a recovery (burst ≥ 2)
      assert.ok(gap >= phase.intervalMin - 1e-9, `${phase.name} gap fell below its minimum`);
      assert.ok(gap <= phase.intervalMax + 1e-9, `${phase.name} gap rose above its maximum`);
    }
  }
});

test('the spawner sends nothing but what the live phase allows', () => {
  for (const phase of PHASES) {
    const log = spawnLog(phase.fromScore, 40, 7);

    assert.ok(log.length > 0, `${phase.name} actually spawns during the sample`);
    for (const entry of log) {
      if (entry === 'arrow') {
        assert.ok(phase.traps.includes('arrow'), `${phase.name} sent an arrow before unlocking it`);
      } else if (entry === 'flyer') {
        assert.ok(phase.traps.includes('flyer'), `${phase.name} sent a flyer before unlocking it`);
      } else {
        const [, count, height] = entry.split(':');
        const n = Number(count);
        assert.ok(phase.traps.includes('spike_cluster'));
        assert.ok(phase.spikes.includes(n), `${phase.name} sent a ${n}-spike cluster it never allows`);
        assert.ok(Number(height) <= OBSTACLES.SPIKE_H_BASE + phase.spikeHVar);
      }
    }
  }
});

test('the same score and the same rolls spawn the same run', () => {
  const first = spawnLog(600, 60, 7);
  const second = spawnLog(600, 60, 7);
  assert.deepEqual(first, second, 'the timeline is replayable — no hidden state');
  assert.ok(new Set(first.map(e => e.split(':')[0])).size > 1, 'the phase really is in rotation');

  // A different seed still obeys the same phase rules.
  const other = spawnLog(600, 60, 99);
  assert.ok(new Set(other.map(e => e.split(':')[0])).size > 1);
});

test('the warm-up sends nothing but spikes — the first phase teaches one verb', () => {
  const log = spawnLog(0, 60, 7);
  assert.ok(log.length > 0, 'the opening phase still spawns');
  assert.ok(
    log.every(entry => entry.startsWith('spike:')),
    `warm-up offered ${log.filter(e => !e.startsWith('spike:')).join(', ')}`,
  );
});
