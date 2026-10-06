import type { RandomPort } from '../ports/RandomPort.ts';
import {
  BREATHER_MAX,
  BREATHER_MIN,
  SPAWN_LAG,
} from './config.ts';
import { variantChanceFor, waveSizeFor, waveSpeedMultiplier } from './rules.ts';
import type { EnemyKind, WavePhase } from './types.ts';

/**
 * The wave lifecycle (Game Design Document, section 5).
 *
 * A domain module, not a system: it owns *decisions* only - how big the next
 * wave is, what it is made of, where on the ring it stands, how long the
 * breather lasts - and hands the answer back as a plan. Placing the zombies,
 * scoring them and drawing them all belong to other components.
 *
 * The lifecycle is:
 *
 *   begin()   -> wave 1 plan (the world places it in the same tick)
 *   tick()    -> while zombies are alive, nothing happens
 *   cleared   -> a random 3-5 s breather, reported exactly once
 *   breather  -> once over, the plan for wave N + 1 comes back
 *
 * Spawn is deliberately instantaneous: the whole wave appears in one tick, so
 * `spawn` phase exists as an action rather than as a state anybody observes.
 * Time only ever reaches this module through `tick(dt)`, which is what makes
 * the level-up freeze - the world simply stops ticking - free of charge.
 */
export class WaveDirector {
  private readonly rng: RandomPort;
  /** Reused plan buffer: a wave costs one array, never one allocation per zombie. */
  private readonly plan: SpawnEntry[] = [];
  /** Reused result record, so a tick allocates nothing. */
  private readonly result: WaveTick = { spawn: null, cleared: false };

  private currentWave = 1;
  private phaseValue: WavePhase = 'fight';
  /** Seconds spent in the current phase; exposed through `phaseAge`. */
  private age = 0;
  private breatherLeft = 0;
  private breatherTotal = 0;
  private clearedWaves = 0;

  constructor(rng: RandomPort) {
    this.rng = rng;
  }

  /** The wave the player is currently in, counting from 1. */
  get wave(): number {
    return this.currentWave;
  }

  get phase(): WavePhase {
    return this.phaseValue;
  }

  /** Seconds spent in the current phase; the banner fades against it. */
  get phaseAge(): number {
    return this.age;
  }

  get breatherRemaining(): number {
    return this.breatherLeft;
  }

  get breatherDuration(): number {
    return this.breatherTotal;
  }

  get wavesCleared(): number {
    return this.clearedWaves;
  }

  /** Speed multiplier applied to every zombie spawned for the current wave. */
  get speedMultiplier(): number {
    return waveSpeedMultiplier(this.currentWave);
  }

  /** Wave 1's plan. Called once, by the world, on the first step of a round. */
  begin(): readonly SpawnEntry[] {
    return this.startWave();
  }

  /**
   * Advances the lifecycle by `dt` seconds against `alive` living zombies.
   *
   * The returned record is reused: read it before the next call and never
   * retain it. `spawn` is valid for that tick only - the world places every
   * entry immediately, which is what makes a wave arrive all at once.
   */
  tick(dt: number, alive: number): WaveTick {
    const result = this.result;
    result.spawn = null;
    result.cleared = false;

    this.age += dt;

    if (this.phaseValue === 'fight') {
      if (alive <= 0) this.startBreather(result);
      return result;
    }

    this.breatherLeft = Math.max(0, this.breatherLeft - dt);
    if (this.breatherLeft <= 0) {
      this.currentWave += 1;
      result.spawn = this.startWave();
    }
    return result;
  }

  // -------------------------------------------------------------------------

  private startBreather(result: WaveTick): void {
    this.phaseValue = 'breather';
    this.age = 0;
    this.clearedWaves += 1;
    this.breatherTotal = BREATHER_MIN + this.rng.pickFloat() * (BREATHER_MAX - BREATHER_MIN);
    this.breatherLeft = this.breatherTotal;
    result.cleared = true;
  }

  private startWave(): readonly SpawnEntry[] {
    this.phaseValue = 'fight';
    this.age = 0;
    return planWave(this.currentWave, this.rng, this.plan);
  }
}

/** One zombie of a wave, as the world is asked to place it. */
export interface SpawnEntry {
  readonly kind: EnemyKind;
  /** Angle around the player, in radians. */
  readonly angle: number;
  /** Extra radius beyond the spawn ring, so arrivals stagger naturally. */
  readonly lag: number;
}

export interface WaveTick {
  /** Non-null: place every entry in this same tick. Reused, so do not retain. */
  spawn: readonly SpawnEntry[] | null;
  /** True the tick a wave was cleared: scoring and banners belong to the world. */
  cleared: boolean;
}

/**
 * The plan for `wave`, written into `out` (which it returns): one entry per
 * zombie - `waveSizeFor` of them - with kinds rolled against the variant
 * chance and angles spread evenly around the ring, jittered inside their slot.
 *
 * Pure apart from `rng`, so a test can inspect any wave without first playing
 * thirty waves to reach it.
 */
export const planWave = (wave: number, rng: RandomPort, out: SpawnEntry[]): SpawnEntry[] => {
  out.length = 0;

  const size = waveSizeFor(wave);
  const variantChance = variantChanceFor(wave);
  const slot = TAU / size;

  for (let i = 0; i < size; i++) {
    out.push({
      kind: rollKind(variantChance, rng),
      angle: i * slot + (rng.pickFloat() - 0.5) * slot * 0.5,
      lag: rng.pickFloat() * SPAWN_LAG,
    });
  }
  return out;
};

/** One zombie of the wave: mostly shamblers, occasionally a variant. */
const rollKind = (variantChance: number, rng: RandomPort): EnemyKind => {
  if (variantChance <= 0 || rng.pickFloat() >= variantChance) return 'zombie';
  return rng.pickFloat() < 0.5 ? 'tank' : 'fast';
};

const TAU = Math.PI * 2;
