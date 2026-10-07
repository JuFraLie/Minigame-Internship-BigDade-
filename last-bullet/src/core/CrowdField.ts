import type { Enemy } from './entities.ts';
import { SpatialHash } from './spatialHash.ts';

/** Bucket edge of the field, in world units: coarse enough to stay cheap. */
const CELL = 64;

/**
 * The spatial index of "who stands where", rebuilt from the pool three times
 * a step: before the walk, after the walk and after the crowd settles.
 *
 * The field deliberately answers only *candidate* questions - "these ids are
 * in the cells overlapping your circle/box" - and never decides anything: the
 * caller does its own distance and liveness test against the bodies it owns.
 * Keeping that one step away is what lets the walk, the contact test and the
 * bullets share one index without sharing any of their rules.
 */
export class CrowdField {
  private readonly hash: SpatialHash;

  constructor(capacity: number) {
    this.hash = new SpatialHash(CELL, capacity);
  }

  /** Re-indexes the live bodies. The pool's slot id *is* the field id. */
  rebuild(enemies: readonly Enemy[]): void {
    this.hash.clear();
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.alive) this.hash.insert(i, enemy.x, enemy.y);
    }
  }

  queryCircle(x: number, y: number, radius: number, out: number[]): number[] {
    return this.hash.queryCircle(x, y, radius, out);
  }

  queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: number[],
  ): number[] {
    return this.hash.queryBox(minX, minY, maxX, maxY, out);
  }
}
