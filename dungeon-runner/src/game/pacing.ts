// pacing.ts — the difficulty scaling loop: pure, deterministic rules.
//
// Simplified Subway Surfers pacing: WHAT spawns and HOW OFTEN comes from the
// score alone (score ≈ distance travelled — 20 points per second of running),
// never from how well the player is doing. There is no player model and no
// memory here: `phaseFor(score)` always answers the same way, so a run that
// reaches score X meets exactly the same timeline as any other run that
// reached X — the pacing is a strict, replayable schedule.
//
// The only randomness is a roll the CALLER supplies (see ObstacleSpawner), and
// it only ever answers "which member of the phase's menu comes next" — never
// when the next spawn happens, nor how big or how tall it is.

import { OBSTACLES, PACING } from '../config/gameConfig.ts';
import type { TrapType } from './obstacles.ts';

/** One band of the timeline: its own rhythm, menu and intensity. */
export interface Phase {
  readonly name: string;
  /** First score at which this phase is live (inclusive). */
  readonly fromScore: number;
  readonly intervalMin: number;
  readonly intervalMax: number;
  /** Spawns per burst — after every `burst`th spawn the timeline breathes. */
  readonly burst: number;
  /** Extra seconds of recovery before a new burst starts. */
  readonly rest: number;
  /** Weighted menu of traps (an entry listed twice weighs double). */
  readonly traps: readonly TrapType[];
  /** Weighted menu of spike-cluster sizes (1 = single spike). */
  readonly spikes: readonly number[];
  /** Extra spike height in px, on top of OBSTACLES.SPIKE_H_BASE. */
  readonly spikeHVar: number;
}

/** The timeline itself — declared in config, ordered from calm to intense. */
export const PHASES: readonly Phase[] = PACING.PHASES;

/** Rolls are probabilities: clamp so a stray 1.0 can never index past a menu. */
function clamp01(roll: number): number {
  if (!(roll > 0)) return 0; // also catches NaN
  return roll > 1 ? 1 : roll;
}

/** The phase a run is in at `score`. Pure: same score → same phase. */
export function phaseFor(score: number): Phase {
  let current = PHASES[0];
  for (const phase of PHASES) {
    if (score >= phase.fromScore) current = phase;
  }
  return current;
}

/**
 * Seconds until the spawn numbered `spawnIndex` (0-based).
 *
 * This is where the LOOP lives: the gap that OPENS a new burst (every
 * `burst`th index) carries the phase's `rest`, so the run breathes on a fixed
 * rhythm — tension, tension, … recovery, tension, …
 *
 * @param roll 0..1 — only picks the position inside `intervalMin..Max`.
 */
export function spawnInterval(phase: Phase, spawnIndex: number, roll: number): number {
  const t = clamp01(roll);
  const base = phase.intervalMin + t * (phase.intervalMax - phase.intervalMin);
  const opensBurst = spawnIndex > 0 && spawnIndex % phase.burst === 0;
  return opensBurst ? base + phase.rest : base;
}

/** Which trap the phase sends next. `roll` picks a menu entry, nothing else. */
export function pickTrap(phase: Phase, roll: number): TrapType {
  return phase.traps[Math.min(phase.traps.length - 1, Math.floor(clamp01(roll) * phase.traps.length))];
}

/** How many spikes the next cluster carries, from the phase's weighted menu. */
export function pickSpikeCount(phase: Phase, roll: number): number {
  return phase.spikes[Math.min(phase.spikes.length - 1, Math.floor(clamp01(roll) * phase.spikes.length))];
}

/** How tall the next cluster gets — bounded by the phase, never by the player. */
export function pickSpikeHeight(phase: Phase, roll: number): number {
  return OBSTACLES.SPIKE_H_BASE + clamp01(roll) * phase.spikeHVar;
}

/** The score at which `trap` first appears on a menu (`Infinity` = never). */
export function unlockScore(trap: TrapType): number {
  for (const phase of PHASES) {
    if (phase.traps.includes(trap)) return phase.fromScore;
  }
  return Infinity;
}
