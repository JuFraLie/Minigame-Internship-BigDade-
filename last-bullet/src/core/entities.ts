import { ENEMY_STATS } from './config.ts';
import type { BulletState, EnemyKind } from './types.ts';

/**
 * The two bodies the simulation pools, and the pools themselves.
 *
 * This is the only place that knows how a body is stored: the records are
 * plain data, and the pools own the free list, the id counters and the live
 * count. Every other module asks a pool for a slot, reads the records it
 * hands back, and hands them back when the body is done - so "is this thing
 * alive and where does its slot go" is answered once, for the whole core.
 */

/** Seconds a hit stays readable; `EnemyView.hit` normalises against this. */
export const HIT_FLASH = 0.15;

/** Widest enemy, so one circle query covers any contact test. */
export const MAX_ENEMY_RADIUS = Math.max(
  ENEMY_STATS.zombie.radius,
  ENEMY_STATS.fast.radius,
  ENEMY_STATS.tank.radius,
);

/** One zombie. Owned by `EnemyPool`, moved by `EnemyWalk`, hurt by `Weapon`. */
export interface Enemy {
  alive: boolean;
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  xp: number;
  /** Runner wobble phase. */
  wobble: number;
  /** Seconds left of the hit-pop reaction. */
  hit: number;
}

/**
 * One bullet. It stops the instant it touches a zombie - there is no hit
 * budget to track, because a bullet never pierces and never lingers in flight.
 * "Held" is the player's `held` counter, never a slot in this pool.
 */
export interface Bullet {
  alive: boolean;
  /** Globally unique, never reused - the renderer keys its sprites on it. */
  uid: number;
  state: BulletState;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** Distance flown since it was fired. */
  travel: number;
  age: number;
}

/** Pre-filled array, so a pool or a view buffer costs one allocation total. */
export const makeArray = <T>(length: number, factory: () => T): T[] => {
  const out = new Array<T>(length);
  for (let i = 0; i < length; i++) out[i] = factory();
  return out;
};

/**
 * The zombie pool: fixed capacity, free list, stable ids, live count.
 *
 * Slots are handed out in reverse order and returned in the order they were
 * taken, so a warm round never churns the free list; `claim` numbers the body
 * the moment it is taken, which is what keeps a renderer's sprite keys stable
 * for the body's whole life.
 */
export class EnemyPool {
  readonly items: Enemy[];
  private readonly free: number[] = [];
  private nextId = 1;
  private live = 0;

  constructor(capacity: number) {
    this.items = makeArray(capacity, () => ({
      alive: false,
      id: 0,
      kind: 'zombie' as EnemyKind,
      x: 0,
      y: 0,
      hp: 0,
      maxHp: 0,
      speed: 0,
      radius: 0,
      damage: 0,
      xp: 0,
      wobble: 0,
      hit: 0,
    }));
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  /** Bodies currently alive; never above the capacity. */
  get count(): number {
    return this.live;
  }

  /** Claims a dead slot for a new body, or -1 when the pool is full. */
  claim(): number {
    const slot = this.free.pop();
    if (slot === undefined) return -1;

    const enemy = this.items[slot];
    enemy.alive = true;
    enemy.id = this.nextId++;
    this.live += 1;
    return slot;
  }

  /** Returns a body to the pool, or null when the slot was already dead. */
  release(slot: number): Enemy | null {
    const enemy = this.items[slot];
    if (!enemy.alive) return null;

    enemy.alive = false;
    this.live -= 1;
    this.free.push(slot);
    return enemy;
  }
}

/**
 * The bullet pool, owned by the weapon because only the weapon ever claims
 * from it. `uid` is never reused: the renderer keys its sprites on it, and a
 * recycled id would hand one bullet another bullet's sprite.
 */
export class BulletPool {
  readonly items: Bullet[];
  private readonly free: number[] = [];
  private nextUid = 1;
  private live = 0;

  constructor(capacity: number) {
    this.items = makeArray(capacity, () => ({
      alive: false,
      uid: 0,
      state: 'ground' as BulletState,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      travel: 0,
      age: 0,
    }));
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  get count(): number {
    return this.live;
  }

  /** Claims a dead slot for a fresh round trip, or -1 when the pool is full. */
  claim(): number {
    const slot = this.free.pop();
    if (slot === undefined) return -1;

    const bullet = this.items[slot];
    bullet.alive = true;
    bullet.uid = this.nextUid++;
    this.live += 1;
    return slot;
  }

  /** Retires a bullet; false when it was already gone. */
  release(slot: number): boolean {
    const bullet = this.items[slot];
    if (!bullet.alive) return false;

    bullet.alive = false;
    this.live -= 1;
    this.free.push(slot);
    return true;
  }
}
