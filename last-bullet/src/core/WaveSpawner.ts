import { ENEMY_STATS, SPAWN_LAG, SPAWN_RING_MARGIN } from './config.ts';
import type { EnemyPool } from './entities.ts';
import { TAU } from './geometry.ts';
import type { RandomPort } from '../ports/RandomPort.ts';
import { WaveDirector, type SpawnEntry } from './WaveDirector.ts';
import type { EnemyKind, WavePhase } from './types.ts';

/**
 * What arrives, where it stands and when: the wave director's decisions made
 * concrete as bodies on the spawn ring.
 *
 * The director owns the lifecycle (wave size, breather, variant rolls); this
 * module owns the *arrival* - the ring radius derived from the real screen,
 * the slot the body takes in the pool, and the rng call that gives each
 * runner its own wobble phase. Keeping the two apart is what lets a wave be
 * planned without placing it, and placed without asking why.
 */
export class WaveSpawner {
  private readonly director: WaveDirector;
  private readonly pool: EnemyPool;
  private readonly rng: RandomPort;
  /** Radius the bodies appear on: just outside whatever the device shows. */
  private spawnRing = 700;

  constructor(pool: EnemyPool, rng: RandomPort) {
    this.director = new WaveDirector(rng);
    this.pool = pool;
    this.rng = rng;
  }

  get wave(): number {
    return this.director.wave;
  }

  get phase(): WavePhase {
    return this.director.phase;
  }

  /** Seconds spent in the current phase; drives the wave banner. */
  get phaseAge(): number {
    return this.director.phaseAge;
  }

  get breatherRemaining(): number {
    return this.director.breatherRemaining;
  }

  get breatherDuration(): number {
    return this.director.breatherDuration;
  }

  get wavesCleared(): number {
    return this.director.wavesCleared;
  }

  /** Speed multiplier applied to every zombie spawned for the current wave. */
  get speedMultiplier(): number {
    return this.director.speedMultiplier;
  }

  /**
   * The visible play area in world units. The spawn ring sits just outside it
   * so enemies always arrive from off-screen, whatever the device is.
   */
  setViewSize(width: number, height: number): void {
    this.spawnRing = Math.hypot(width / 2, height / 2) + SPAWN_RING_MARGIN;
  }

  /** Wave 1's plan, placed at once - called on the round's first step. */
  begin(px: number, py: number): void {
    this.place(this.director.begin(), px, py);
  }

  /**
   * One wave decision per step. A clear only changes what the frame is worth
   * (the score is derived from the director), and a plan is placed in the
   * very same tick, so a wave always arrives all at once.
   */
  tick(dt: number, alive: number, px: number, py: number): void {
    const tick = this.director.tick(dt, alive);
    if (tick.spawn) this.place(tick.spawn, px, py);
  }

  /**
   * Diagnostics for the test suite, next to `counts()`: rings `count` zombies
   * around the player without going through the wave director. A performance
   * test can then measure a full 120-zombie wave without first playing thirty
   * waves to reach it. Returns how many were placed.
   */
  seedRing(count: number, px: number, py: number): number {
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU;
      if (this.spawnOne('zombie', angle, this.spawnRing + this.rng.pickFloat() * SPAWN_LAG, px, py)) {
        placed += 1;
      }
    }
    return placed;
  }

  private place(entries: readonly SpawnEntry[], px: number, py: number): void {
    const ring = this.spawnRing;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      this.spawnOne(entry.kind, entry.angle, ring + entry.lag, px, py);
    }
  }

  /** One body, claimed from the pool and filled from its kind's stats. */
  private spawnOne(kind: EnemyKind, angle: number, radius: number, px: number, py: number): boolean {
    const slot = this.pool.claim();
    if (slot < 0) return false;

    const stats = ENEMY_STATS[kind];
    const enemy = this.pool.items[slot];
    enemy.kind = kind;
    enemy.x = px + Math.cos(angle) * radius;
    enemy.y = py + Math.sin(angle) * radius;
    enemy.maxHp = stats.hp;
    enemy.hp = stats.hp;
    enemy.speed = stats.speed * this.director.speedMultiplier;
    enemy.radius = stats.radius;
    enemy.damage = stats.damage;
    enemy.xp = stats.xp;
    enemy.wobble = this.rng.pickFloat() * TAU;
    enemy.hit = 0;
    return true;
  }
}
