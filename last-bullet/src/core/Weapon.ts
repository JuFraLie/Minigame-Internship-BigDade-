import { BULLET_CAP, BULLET_RADIUS, BULLET_SPEED, PLAYER_RADIUS } from './config.ts';
import type { CrowdField } from './CrowdField.ts';
import {
  BulletPool,
  HIT_FLASH,
  MAX_ENEMY_RADIUS,
  type Bullet,
  type EnemyPool,
} from './entities.ts';
import { distSq, segmentIntersectsCircle } from './geometry.ts';
import type { Progression } from './Progression.ts';
import type { Survivor } from './Survivor.ts';
import {
  bloodFrenzyEnabled,
  boomerangEnabled,
  bulletDamageFor,
  bulletRangeFor,
  chamberFor,
  crawlSpeedFor,
  explosiveRadiusFor,
  fireRangeFor,
  pickupRadiusFor,
  returnSpeedFor,
  shotDelayFor,
} from './rules.ts';
import type { WorldEventsPort } from './types.ts';

/**
 * What the gun does: the chamber, the trigger, the flight of every bullet, its
 * one hit, the blast that may follow it, and how it comes back to the hand.
 *
 * The weapon reads the survivor for aim and origin, the field for what is in
 * the way, and the upgrade stacks for what the shot is worth - but it never
 * decides that something *died*. It hands the slot to `KillSink` and lets the
 * world do the accounting (score, XP, events), because a kill is a round-level
 * fact, not a bullet's.
 */

/** The one thing the weapon may ask of the world when a body goes down. */
export interface KillSink {
  /** `slot` holds a body whose hp just reached zero. */
  onEnemyDown(slot: number): void;
}

interface WeaponDeps {
  readonly enemies: EnemyPool;
  readonly field: CrowdField;
  readonly survivor: Survivor;
  readonly progression: Progression;
  readonly events: WorldEventsPort;
  readonly kills: KillSink;
}

export class Weapon {
  /** The round's bullets; the renderer reads the pool through the frame. */
  readonly bullets: BulletPool;

  /** Rounds in the hand. Firing moves one out, collecting moves it back. */
  private heldCount = 1;
  private cooldown = 0;
  /**
   * Blood Frenzy kills waiting for a bullet: one per kill, capped by how many
   * the hand could still take, so a blast that kills a pack promises a full
   * chamber and never more.
   */
  private bloodReturns = 0;

  private readonly enemies: EnemyPool;
  private readonly field: CrowdField;
  private readonly survivor: Survivor;
  private readonly progression: Progression;
  private readonly events: WorldEventsPort;
  private readonly kills: KillSink;
  /** Candidate buffer, reused across queries so a step allocates nothing. */
  private readonly candidates: number[] = [];
  /** Blast victims of Explosive Round, separate from the query above it. */
  private readonly blast: number[] = [];
  /** Where the last bullet hit: reused so a hit allocates nothing. */
  private readonly impact = { x: 0, y: 0 };

  constructor(deps: WeaponDeps) {
    this.enemies = deps.enemies;
    this.field = deps.field;
    this.survivor = deps.survivor;
    this.progression = deps.progression;
    this.events = deps.events;
    this.kills = deps.kills;
    this.bullets = new BulletPool(BULLET_CAP);
  }

  /** Rounds in the hand; the frame shows it and the trigger checks it. */
  get held(): number {
    return this.heldCount;
  }

  get chamber(): number {
    return chamberFor(this.progression.stacks);
  }

  /** 0..1 firing cooldown progress; the HUD reads it as an "armed" readout. */
  get charge(): number {
    if (this.heldCount <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - this.cooldown / shotDelayFor(this.progression.stacks)));
  }

  /** The chamber card hands over the round it promises - see `GameWorld.choose`. */
  grantChamber(): void {
    this.heldCount += 1;
  }

  /** Ticks the shot cooldown down; it never goes below zero. */
  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /** Auto-fire at the closest thing inside range, if the chamber has one. */
  tryFire(): void {
    if (this.heldCount <= 0 || this.cooldown > 0) return;

    const target = this.nearestEnemy(fireRangeFor(this.progression.stacks));
    if (target < 0) return; // in hand, but nothing in range: hold the shot

    const enemy = this.enemies.items[target];
    const px = this.survivor.x;
    const py = this.survivor.y;
    const dx = enemy.x - px;
    const dy = enemy.y - py;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);

    const slot = this.bullets.claim();
    if (slot < 0) return;

    const bullet = this.bullets.items[slot];
    bullet.state = 'flight';
    bullet.x = px;
    bullet.y = py;
    bullet.vx = (dx / d) * BULLET_SPEED;
    bullet.vy = (dy / d) * BULLET_SPEED;
    bullet.angle = angle;
    bullet.travel = 0;
    bullet.age = 0;

    this.heldCount -= 1;
    this.cooldown = shotDelayFor(this.progression.stacks);
    this.survivor.face(angle);
    this.events.onBulletFired({ x: px, y: py, angle, held: this.heldCount });
  }

  /**
   * Blood Frenzy (legendary): every kill hands a bullet straight back. The
   * nearest one lying out returns on the spot; if they are all still in the
   * air, the kill is banked and paid out as flights come down - one promise
   * per kill, never more than the chamber could hold.
   */
  onKill(): void {
    if (!bloodFrenzyEnabled(this.progression.stacks)) return;
    if (this.heldCount >= this.chamber) return;

    let best = -1;
    let bestSq = Infinity;
    const items = this.bullets.items;
    for (let i = 0; i < items.length; i++) {
      const bullet = items[i];
      if (!bullet.alive || bullet.state === 'flight') continue;
      const d = distSq(bullet.x, bullet.y, this.survivor.x, this.survivor.y);
      if (d < bestSq) {
        bestSq = d;
        best = i;
      }
    }

    if (best >= 0) {
      this.tryCollect(items[best], best);
      return;
    }
    if (this.bloodReturns < this.chamber - this.heldCount) this.bloodReturns += 1;
  }

  /** Moves every bullet one step: flight, return, or lying on the ground. */
  step(dt: number): void {
    const items = this.bullets.items;
    for (let i = 0; i < items.length; i++) {
      const bullet = items[i];
      if (!bullet.alive) continue;

      if (bullet.state === 'flight') {
        this.flight(bullet, i, dt);
        continue;
      }

      if (bullet.state === 'return') {
        this.returnHome(bullet, i, dt);
        continue;
      }

      this.ground(bullet, i, dt);
    }
  }

  // --- flight --------------------------------------------------------------

  private flight(bullet: Bullet, slot: number, dt: number): void {
    const nx = bullet.x + bullet.vx * dt;
    const ny = bullet.y + bullet.vy * dt;

    // The first zombie in the path ends the flight, right there: a bullet
    // never pierces and never keeps going past what it hit.
    const hit = this.firstHit(bullet.x, bullet.y, nx, ny);
    if (hit !== null) {
      this.stopBullet(bullet, slot, hit.x, hit.y);
      return;
    }

    bullet.x = nx;
    bullet.y = ny;
    bullet.travel += BULLET_SPEED * dt;

    if (bullet.travel >= bulletRangeFor(this.progression.stacks)) {
      this.stopBullet(bullet, slot, bullet.x, bullet.y);
    }
  }

  private returnHome(bullet: Bullet, slot: number, dt: number): void {
    const dx = this.survivor.x - bullet.x;
    const dy = this.survivor.y - bullet.y;
    const d2 = dx * dx + dy * dy;
    const reach = pickupRadiusFor(this.progression.stacks);

    if (d2 <= reach * reach) {
      this.tryCollect(bullet, slot);
      return;
    }

    const d = Math.sqrt(d2);
    const ux = dx / d;
    const uy = dy / d;
    bullet.x += ux * Math.min(returnSpeedFor(this.progression.stacks) * dt, d);
    bullet.y += uy * Math.min(returnSpeedFor(this.progression.stacks) * dt, d);
    // Nothing is harmed on the way home: the bullet has had its one hit.
    bullet.angle = Math.atan2(uy, ux);
  }

  /**
   * Ground: it lies there for the rest of the round. Standing on it takes it
   * at once; the Magnet instead drags it in, and it is yours only when it
   * actually touches you.
   */
  private ground(bullet: Bullet, slot: number, dt: number): void {
    bullet.age += dt;
    const dx = this.survivor.x - bullet.x;
    const dy = this.survivor.y - bullet.y;
    const d2 = dx * dx + dy * dy;
    const touch = PLAYER_RADIUS + BULLET_RADIUS;
    if (d2 <= touch * touch) {
      this.tryCollect(bullet, slot);
      return;
    }

    const reach = pickupRadiusFor(this.progression.stacks);
    if (d2 > reach * reach) return;

    const crawl = crawlSpeedFor(this.progression.stacks);
    if (crawl <= 0) {
      // No Magnet: walking within the pickup radius is all it takes.
      this.tryCollect(bullet, slot);
      return;
    }

    const d = Math.sqrt(d2);
    const ux = dx / d;
    const uy = dy / d;
    const gap = d - touch;
    const step = crawl * dt;
    if (gap <= step) {
      // This stride would carry it past you: park it on your shoulder and
      // hand it over - or leave it waiting there while the chamber is full.
      bullet.x = this.survivor.x - ux * touch;
      bullet.y = this.survivor.y - uy * touch;
      bullet.angle = Math.atan2(uy, ux);
      this.tryCollect(bullet, slot);
      return;
    }
    bullet.x += ux * step;
    bullet.y += uy * step;
    bullet.angle = Math.atan2(uy, ux);
  }

  /**
   * Ends a flight at the point it stopped: on the zombie it hit, or out at
   * max range if it missed. Boomerang makes it fly home instead of dropping.
   */
  private stopBullet(bullet: Bullet, slot: number, x: number, y: number): void {
    bullet.x = x;
    bullet.y = y;
    bullet.age = 0;
    bullet.state = boomerangEnabled(this.progression.stacks) ? 'return' : 'ground';
    this.spendBloodReturn(bullet, slot);
  }

  /** One promised Blood Frenzy bullet has come down: offer it to the hand. */
  private spendBloodReturn(bullet: Bullet, slot: number): void {
    if (this.bloodReturns <= 0) return;
    this.tryCollect(bullet, slot);
  }

  private tryCollect(bullet: Bullet, slot: number): void {
    if (this.heldCount < this.chamber) {
      this.heldCount += 1;
      // Any bullet that reaches the hand pays off one Blood Frenzy promise,
      // whether it was walked over or called back by a kill.
      if (this.bloodReturns > 0) this.bloodReturns -= 1;
      this.bullets.release(slot);
      this.events.onBulletPickedUp({ x: bullet.x, y: bullet.y, held: this.heldCount });
      return;
    }
    // Chamber full: a returning bullet drops where it arrived and waits.
    if (bullet.state === 'return') {
      bullet.state = 'ground';
      bullet.age = 0;
    }
  }

  // --- damage --------------------------------------------------------------

  /**
   * The first zombie the flight segment touches, and where the bullet stopped
   * to touch it. The target takes the bullet's damage (plus the Explosive
   * Round blast, if that card is up) and the caller ends the flight on the
   * returned point - so a bullet always comes to rest in the horde, never
   * through it.
   *
   * Returns `null` when the segment touched nothing: the flight carries on.
   * The result is a reused scratch record - read it before the next hit.
   */
  private firstHit(x0: number, y0: number, x1: number, y1: number): { x: number; y: number } | null {
    const list = this.candidates;
    list.length = 0;
    const pad = BULLET_RADIUS + MAX_ENEMY_RADIUS;
    this.field.queryBox(
      Math.min(x0, x1) - pad,
      Math.min(y0, y1) - pad,
      Math.max(x0, x1) + pad,
      Math.max(y0, y1) + pad,
      list,
    );

    const segX = x1 - x0;
    const segY = y1 - y0;
    const lenSq = segX * segX + segY * segY;
    const damage = bulletDamageFor(this.progression.stacks);
    const enemies = this.enemies.items;

    for (let i = 0; i < list.length; i++) {
      const index = list[i];
      const enemy = enemies[index];
      if (!enemy.alive) continue;

      const reach = enemy.radius + BULLET_RADIUS;
      if (!segmentIntersectsCircle(x0, y0, x1, y1, enemy.x, enemy.y, reach)) continue;

      enemy.hit = HIT_FLASH;
      enemy.hp -= damage;

      // Where its path met the zombie: the same projection the test used.
      let t = lenSq > 0 ? ((enemy.x - x0) * segX + (enemy.y - y0) * segY) / lenSq : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      this.impact.x = x0 + t * segX;
      this.impact.y = y0 + t * segY;

      if (enemy.hp <= 0) this.kills.onEnemyDown(index);
      this.detonate(this.impact.x, this.impact.y, index);
      return this.impact;
    }
    return null;
  }

  /**
   * Explosive Round (legendary): the impact hurts every zombie inside the
   * blast. The direct target is skipped - it has already paid for this
   * bullet, and a kill from the blast counts exactly like any other.
   */
  private detonate(x: number, y: number, direct: number): void {
    const radius = explosiveRadiusFor(this.progression.stacks);
    if (radius <= 0) return;

    this.events.onExplosion({ x, y, radius });

    const list = this.blast;
    list.length = 0;
    this.field.queryCircle(x, y, radius, list);

    const damage = bulletDamageFor(this.progression.stacks);
    const radiusSq = radius * radius;
    const enemies = this.enemies.items;
    for (let i = 0; i < list.length; i++) {
      const index = list[i];
      if (index === direct) continue;
      const enemy = enemies[index];
      if (!enemy.alive) continue;
      if (distSq(enemy.x, enemy.y, x, y) > radiusSq) continue;

      enemy.hit = HIT_FLASH;
      enemy.hp -= damage;
      if (enemy.hp <= 0) this.kills.onEnemyDown(index);
    }
  }

  /** Index of the closest live enemy within `range`, or -1. */
  private nearestEnemy(range: number): number {
    const list = this.candidates;
    list.length = 0;
    this.field.queryCircle(this.survivor.x, this.survivor.y, range, list);

    let best = -1;
    let bestSq = range * range;
    const enemies = this.enemies.items;
    const px = this.survivor.x;
    const py = this.survivor.y;
    for (let i = 0; i < list.length; i++) {
      const index = list[i];
      const enemy = enemies[index];
      if (!enemy.alive) continue;
      const d = distSq(enemy.x, enemy.y, px, py);
      if (d <= bestSq) {
        bestSq = d;
        best = index;
      }
    }
    return best;
  }
}
