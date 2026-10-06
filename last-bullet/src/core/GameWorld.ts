import type { RandomPort } from '../ports/RandomPort.ts';
import type { RenderPort } from '../ports/RenderPort.ts';
import type { UpgradePort } from '../ports/UpgradePort.ts';
import {
  BULLET_CAP,
  BULLET_RADIUS,
  BULLET_SPEED,
  ENEMY_CAP,
  ENEMY_STATS,
  INVULNERABLE_SECONDS,
  LEGENDARY_CHANCE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  SECOND_WIND_HEARTS,
  SECOND_WIND_INVULN,
  SECOND_WIND_PUSH,
  SPAWN_LAG,
  SPAWN_RING_MARGIN,
  SUPER_RARE_CHANCE,
} from './config.ts';
import {
  availableUpgrades,
  boomerangEnabled,
  bloodFrenzyEnabled,
  bulletDamageFor,
  bulletRangeFor,
  chamberFor,
  crawlSpeedFor,
  explosiveRadiusFor,
  fireRangeFor,
  initialUpgrades,
  moveSpeedFor,
  pickupRadiusFor,
  rarityPool,
  returnSpeedFor,
  scoreFor,
  shotDelayFor,
  xpNeededForLevel,
  type UpgradeState,
} from './rules.ts';
import { SpatialHash } from './spatialHash.ts';
import { WaveDirector, type SpawnEntry } from './WaveDirector.ts';
import type {
  BulletState,
  EnemyKind,
  EnemyView,
  BulletView,
  Rarity,
  UpgradeId,
  Vec2,
  WorldEventsPort,
  WorldFrame,
} from './types.ts';

/** Seconds a hit stays readable; `EnemyView.hit` normalises against this. */
const HIT_FLASH = 0.15;
/** Widest enemy, so one circle query covers any contact test. */
const MAX_ENEMY_RADIUS = Math.max(
  ENEMY_STATS.zombie.radius,
  ENEMY_STATS.fast.radius,
  ENEMY_STATS.tank.radius,
);
const TAU = Math.PI * 2;

interface Enemy {
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
interface Bullet {
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

const makeArray = <T>(length: number, factory: () => T): T[] => {
  const out = new Array<T>(length);
  for (let i = 0; i < length; i++) out[i] = factory();
  return out;
};

/** Squared distance, so the hot paths never take a square root they skip. */
const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/** Does the segment a->b come within `radius` of the circle at c? */
const segmentIntersectsCircle = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): boolean => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / lenSq : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return distSq(ax + t * dx, ay + t * dy, cx, cy) <= radius * radius;
};

/**
 * The game world: a pure-TypeScript endless-wave simulation.
 *
 * No Phaser, no pixels, no DOM, no clock of its own - it is stepped with an
 * explicit `dt` and a move vector, which is what lets a whole run be replayed
 * headless in the test suite. It owns its pools, its spatial hash and its view
 * frame, so a step allocates nothing once warm.
 *
 * Decisions live in three places: `WaveDirector` decides what arrives and
 * when, `rules.ts` decides what anything is worth, and this class decides
 * where everything stands. It implements the two ports the renderer reads
 * through: `RenderPort` (the frame) and `UpgradePort` (the level-up handshake).
 */
export class GameWorld implements RenderPort, UpgradePort {
  // --- player --------------------------------------------------------------
  private px = 0;
  private py = 0;
  private hp = PLAYER_MAX_HP;
  private invuln = 0;
  private facing = -Math.PI / 2;

  // --- round ---------------------------------------------------------------
  private time = 0;
  private kills = 0;
  /** Banked kill points (10 / 20 / 30); waves and levels are added on read. */
  private points = 0;
  private running = true;
  private win = false;
  private ended = false;

  // --- progression ---------------------------------------------------------
  private level = 1;
  private xp = 0;
  private ups: UpgradeState = initialUpgrades();
  private offersList: UpgradeId[] | null = null;

  // --- shooting ------------------------------------------------------------
  private held = 1;
  private cooldown = 0;
  /** Second Wind has already been spent this round. */
  private secondWindUsed = false;
  /**
   * Blood Frenzy kills waiting for a bullet: one per kill, capped by how many
   * the hand could still take, so a blast that kills a pack promises a full
   * chamber and never more.
   */
  private bloodReturns = 0;

  // --- waves ---------------------------------------------------------------
  private readonly wave: WaveDirector;
  private spawnRing = 700;
  /** Wave 1 is placed on the first step, when the view size is already known. */
  private started = false;

  // --- pools ---------------------------------------------------------------
  private readonly enemies: Enemy[];
  private readonly enemyFree: number[] = [];
  private enemiesAlive = 0;
  private readonly bullets: Bullet[];
  private readonly bulletFree: number[] = [];
  private bulletsAlive = 0;
  private nextId = 1;
  private bulletUid = 1;

  // --- scratch -------------------------------------------------------------
  private readonly rng: RandomPort;
  private readonly events: WorldEventsPort;
  private readonly hash: SpatialHash;
  private readonly candidates: number[] = [];
  /** Blast victims of Explosive Round, separate from the query above it. */
  private readonly blast: number[] = [];
  /** Where the last bullet hit: reused so a hit allocates nothing. */
  private readonly impact = { x: 0, y: 0 };

  // --- view frame ----------------------------------------------------------
  private readonly frame: WorldFrame;
  private readonly enemyViews: EnemyView[];
  private readonly bulletViews: BulletView[];
  private dirty = true;

  constructor(rng: RandomPort, events: WorldEventsPort) {
    // Plain fields rather than constructor parameter properties: Node's
    // `--experimental-strip-types` only erases types, so it cannot rewrite a
    // parameter into a field assignment.
    this.rng = rng;
    this.events = events;
    this.wave = new WaveDirector(rng);

    this.enemies = makeArray(ENEMY_CAP, () => ({
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
    for (let i = ENEMY_CAP - 1; i >= 0; i--) this.enemyFree.push(i);

    this.bullets = makeArray(BULLET_CAP, () => ({
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
    for (let i = BULLET_CAP - 1; i >= 0; i--) this.bulletFree.push(i);

    this.hash = new SpatialHash(64, ENEMY_CAP);

    this.enemyViews = makeArray(ENEMY_CAP, () => ({
      id: 0,
      kind: 'zombie' as EnemyKind,
      x: 0,
      y: 0,
      radius: 0,
      hp: 0,
      maxHp: 0,
      hit: 0,
    }));
    this.bulletViews = makeArray(BULLET_CAP, () => ({
      id: 0,
      state: 'ground' as BulletState,
      x: 0,
      y: 0,
      angle: 0,
      age: 0,
    }));

    this.frame = {
      running: true,
      win: false,
      time: 0,
      wave: 1,
      phase: 'fight',
      phaseAge: 0,
      breatherLeft: 0,
      breatherTotal: 0,
      kills: 0,
      level: 1,
      xp: 0,
      xpNeeded: xpNeededForLevel(1),
      score: 0,
      held: 1,
      chamber: 1,
      stacks: { ...initialUpgrades() },
      offers: null,
      player: { x: 0, y: 0, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, invulnerable: false, facing: this.facing, charge: 1 },
      enemies: [],
      bullets: [],
    };
  }

  // -------------------------------------------------------------------------
  // Ports
  // -------------------------------------------------------------------------

  getFrame(): WorldFrame {
    if (this.dirty) this.rebuild();
    return this.frame;
  }

  offers(): readonly UpgradeId[] | null {
    return this.offersList;
  }

  choose(id: UpgradeId): boolean {
    const pending = this.offersList;
    if (pending === null || !pending.includes(id)) return false;

    this.ups[id] = this.ups[id] + 1;
    if (id === 'mend') this.hp = Math.min(PLAYER_MAX_HP, this.hp + 2);

    // The chamber card hands over the round it promises. Bullets are a
    // conserved pool - firing moves one out of the hand, collecting moves it
    // back - so growing the capacity alone would leave every extra slot empty
    // for the rest of the run. `held` cannot overshoot: it was at most the old
    // capacity, and the capacity has just grown by one.
    if (id === 'extraChamber') this.held += 1;

    this.offersList = null;
    this.dirty = true;
    this.events.onUpgradeChosen({ id, level: this.level });
    return true;
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * The visible play area in world units. The spawn ring sits just outside it
   * so enemies always arrive from off-screen, whatever the device is.
   */
  setViewSize(width: number, height: number): void {
    this.spawnRing = Math.hypot(width / 2, height / 2) + SPAWN_RING_MARGIN;
    this.dirty = true;
  }

  /** True while the simulation must not advance: level-up card or round over. */
  frozen(): boolean {
    return !this.running || this.offersList !== null;
  }

  /**
   * Live entity counts. Diagnostics for the test suite - the renderer reads
   * the frame, not these - but also the cheapest way to prove the pools stay
   * inside their caps for a whole round.
   */
  counts(): { enemies: number; bullets: number } {
    return { enemies: this.enemiesAlive, bullets: this.bulletsAlive };
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  /**
   * One fixed step. `move` is the normalised world-space drag vector, already
   * converted from screen space by the input adapter.
   */
  step(dt: number, move: Vec2): void {
    if (!this.running || this.offersList !== null) return;
    this.dirty = true;

    this.time += dt;

    // Wave 1 waits for the first step so the spawn ring is already the real
    // device's, not the constructor's default.
    if (!this.started) {
      this.started = true;
      this.placeWave(this.wave.begin());
    }

    this.movePlayer(dt, move);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    this.directorStep(dt);
    this.moveEnemies(dt);
    this.rebuildHash();
    this.stepBullets(dt);
    if (!this.running) return;

    this.checkContact();
    if (!this.running) return;

    this.tryFire();
    this.checkLevelUp();
  }

  private movePlayer(dt: number, move: Vec2): void {
    let mx = move.x;
    let my = move.y;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag <= 0.001) return;

    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const speed = moveSpeedFor(this.ups);
    this.px += mx * speed * dt;
    this.py += my * speed * dt;
    this.facing = Math.atan2(my, mx);
  }

  // --- waves ---------------------------------------------------------------

  /**
   * One wave decision per step. `WaveDirector` reports a clear (score and
   * banners follow) or hands back the next wave's plan, which is placed in the
   * very same tick so a wave always arrives all at once.
   */
  private directorStep(dt: number): void {
    const tick = this.wave.tick(dt, this.enemiesAlive);
    if (tick.spawn) this.placeWave(tick.spawn);
    // A cleared wave only changes what the frame is worth: the score is
    // derived from the director, so there is nothing to bank here.
  }

  private placeWave(entries: readonly SpawnEntry[]): void {
    const ring = this.spawnRing;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      this.spawnOne(entry.kind, entry.angle, ring + entry.lag);
    }
  }

  private spawnOne(kind: EnemyKind, angle: number, radius: number): boolean {
    const slot = this.enemyFree.pop();
    if (slot === undefined) return false;

    const stats = ENEMY_STATS[kind];
    const enemy = this.enemies[slot];
    enemy.alive = true;
    enemy.id = this.nextId++;
    enemy.kind = kind;
    enemy.x = this.px + Math.cos(angle) * radius;
    enemy.y = this.py + Math.sin(angle) * radius;
    enemy.maxHp = stats.hp;
    enemy.hp = stats.hp;
    enemy.speed = stats.speed * this.wave.speedMultiplier;
    enemy.radius = stats.radius;
    enemy.damage = stats.damage;
    enemy.xp = stats.xp;
    enemy.wobble = this.rng.pickFloat() * TAU;
    enemy.hit = 0;

    this.enemiesAlive += 1;
    return true;
  }

  /**
   * Diagnostics for the test suite, next to `counts()`: rings `count` zombies
   * around the player without going through the wave director. A performance
   * test can then measure a full 120-zombie wave without first playing thirty
   * waves to reach it. Returns how many were placed.
   */
  seedRing(count: number): number {
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU;
      if (this.spawnOne('zombie', angle, this.spawnRing + this.rng.pickFloat() * SPAWN_LAG)) {
        placed += 1;
      }
    }
    this.dirty = true;
    return placed;
  }

  /**
   * Diagnostics for the test suite, next to `seedRing`: hands over a card
   * instead of waiting for the level-up roll, so an effect that only unlocks
   * at wave 10 or 14 can be pinned down without first playing that far. It
   * moves the stack count only - card side effects such as Mend's heal belong
   * to `choose`.
   */
  grantUpgrade(id: UpgradeId, stacks = 1): void {
    this.ups[id] = this.ups[id] + stacks;
    this.dirty = true;
  }

  /**
   * Diagnostics for the test suite, next to `grantUpgrade`: deals a level-up
   * offering exactly these cards, so a card's own effect can be pinned down
   * without waiting for the roll to hand it over. The world freezes exactly
   * as a real level-up does until one of them is taken.
   */
  offerCards(ids: readonly UpgradeId[]): void {
    if (this.ended || this.offersList !== null || ids.length === 0) return;
    this.offersList = [...ids];
    this.dirty = true;
    this.events.onLevelUp({ level: this.level, offers: this.offersList });
  }

  // --- enemies -------------------------------------------------------------

  private moveEnemies(dt: number): void {
    for (let i = 0; i < ENEMY_CAP; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;

      const dx = this.px - enemy.x;
      const dy = this.py - enemy.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      let ux = dx / d;
      let uy = dy / d;

      if (enemy.kind === 'fast') {
        // Erratic wobble: a perpendicular sway on top of the homing vector.
        enemy.wobble += dt * 7;
        const sway = Math.sin(enemy.wobble) * 0.6;
        const hx = ux - uy * sway;
        const hy = uy + ux * sway;
        const n = Math.sqrt(hx * hx + hy * hy) || 1;
        ux = hx / n;
        uy = hy / n;
      }

      enemy.x += ux * enemy.speed * dt;
      enemy.y += uy * enemy.speed * dt;
      if (enemy.hit > 0) enemy.hit = Math.max(0, enemy.hit - dt);
    }
  }

  private rebuildHash(): void {
    this.hash.clear();
    for (let i = 0; i < ENEMY_CAP; i++) {
      const enemy = this.enemies[i];
      if (enemy.alive) this.hash.insert(i, enemy.x, enemy.y);
    }
  }

  /** Index of the closest live enemy within `range`, or -1. */
  private nearestEnemy(range: number): number {
    const list = this.candidates;
    list.length = 0;
    this.hash.queryCircle(this.px, this.py, range, list);

    let best = -1;
    let bestSq = range * range;
    for (let i = 0; i < list.length; i++) {
      const index = list[i];
      const enemy = this.enemies[index];
      if (!enemy.alive) continue;
      const d = distSq(enemy.x, enemy.y, this.px, this.py);
      if (d <= bestSq) {
        bestSq = d;
        best = index;
      }
    }
    return best;
  }

  private checkContact(): void {
    if (this.invuln > 0) return;

    const list = this.candidates;
    list.length = 0;
    this.hash.queryCircle(this.px, this.py, PLAYER_RADIUS + MAX_ENEMY_RADIUS, list);

    for (let i = 0; i < list.length; i++) {
      const enemy = this.enemies[list[i]];
      if (!enemy.alive) continue;
      const reach = enemy.radius + PLAYER_RADIUS;
      if (distSq(enemy.x, enemy.y, this.px, this.py) > reach * reach) continue;

      this.hp = Math.max(0, this.hp - enemy.damage);

      // Second Wind: the fatal hit burns the card instead of the run.
      if (this.hp <= 0 && this.tryRevive()) return;

      this.invuln = INVULNERABLE_SECONDS;
      this.events.onPlayerHit({ hp: this.hp, maxHp: PLAYER_MAX_HP });
      if (this.hp <= 0) this.finish();
      return;
    }
  }

  /**
   * Second Wind (legendary): once per round a hit that would have ended the
   * round instead restores three hearts and shoves everything close to the
   * player clear. Score, wave, level and upgrades all carry on untouched, so
   * this is a revive inside the round and never a restart.
   */
  private tryRevive(): boolean {
    if (this.secondWindUsed || this.ups.secondWind <= 0) return false;

    this.secondWindUsed = true;
    this.hp = SECOND_WIND_HEARTS;
    this.invuln = SECOND_WIND_INVULN;

    for (let i = 0; i < ENEMY_CAP; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      const dx = enemy.x - this.px;
      const dy = enemy.y - this.py;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d >= SECOND_WIND_PUSH) continue;
      enemy.x = this.px + (dx / d) * SECOND_WIND_PUSH;
      enemy.y = this.py + (dy / d) * SECOND_WIND_PUSH;
    }

    this.events.onPlayerHit({ hp: this.hp, maxHp: PLAYER_MAX_HP });
    return true;
  }

  // --- bullets -------------------------------------------------------------

  private tryFire(): void {
    if (this.held <= 0 || this.cooldown > 0) return;

    const target = this.nearestEnemy(fireRangeFor(this.ups));
    if (target < 0) return; // in hand, but nothing in range: hold the shot

    const enemy = this.enemies[target];
    const dx = enemy.x - this.px;
    const dy = enemy.y - this.py;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);

    const slot = this.bulletFree.pop();
    if (slot === undefined) return;

    const bullet = this.bullets[slot];
    bullet.alive = true;
    bullet.uid = this.bulletUid++;
    bullet.state = 'flight';
    bullet.x = this.px;
    bullet.y = this.py;
    bullet.vx = (dx / d) * BULLET_SPEED;
    bullet.vy = (dy / d) * BULLET_SPEED;
    bullet.angle = angle;
    bullet.travel = 0;
    bullet.age = 0;

    this.bulletsAlive += 1;
    this.held -= 1;
    this.cooldown = shotDelayFor(this.ups);
    this.facing = angle;
    this.events.onBulletFired({ x: this.px, y: this.py, angle, held: this.held });
  }

  private stepBullets(dt: number): void {
    for (let i = 0; i < BULLET_CAP; i++) {
      const bullet = this.bullets[i];
      if (!bullet.alive) continue;

      if (bullet.state === 'flight') {
        const nx = bullet.x + bullet.vx * dt;
        const ny = bullet.y + bullet.vy * dt;

        // The first zombie in the path ends the flight, right there: a bullet
        // never pierces and never keeps going past what it hit.
        const hit = this.firstHit(bullet.x, bullet.y, nx, ny);
        if (hit !== null) {
          this.stopBullet(bullet, i, hit.x, hit.y);
          continue;
        }

        bullet.x = nx;
        bullet.y = ny;
        bullet.travel += BULLET_SPEED * dt;

        if (bullet.travel >= bulletRangeFor(this.ups)) this.stopBullet(bullet, i, bullet.x, bullet.y);
        continue;
      }

      if (bullet.state === 'return') {
        const dx = this.px - bullet.x;
        const dy = this.py - bullet.y;
        const d2 = dx * dx + dy * dy;
        const reach = pickupRadiusFor(this.ups);

        if (d2 <= reach * reach) {
          this.tryCollect(bullet, i);
          continue;
        }

        const d = Math.sqrt(d2);
        const ux = dx / d;
        const uy = dy / d;
        bullet.x += ux * Math.min(returnSpeedFor(this.ups) * dt, d);
        bullet.y += uy * Math.min(returnSpeedFor(this.ups) * dt, d);
        // Nothing is harmed on the way home: the bullet has had its one hit.
        bullet.angle = Math.atan2(uy, ux);
        continue;
      }

      // Ground: it lies there for the rest of the round. Standing on it takes
      // it at once; the Magnet instead drags it in, and it is yours only when
      // it actually touches you.
      bullet.age += dt;
      const dx = this.px - bullet.x;
      const dy = this.py - bullet.y;
      const d2 = dx * dx + dy * dy;
      const touch = PLAYER_RADIUS + BULLET_RADIUS;
      if (d2 <= touch * touch) {
        this.tryCollect(bullet, i);
        continue;
      }

      const reach = pickupRadiusFor(this.ups);
      if (d2 > reach * reach) continue;

      const crawl = crawlSpeedFor(this.ups);
      if (crawl <= 0) {
        // No Magnet: walking within the pickup radius is all it takes.
        this.tryCollect(bullet, i);
        continue;
      }

      const d = Math.sqrt(d2);
      const ux = dx / d;
      const uy = dy / d;
      const gap = d - touch;
      const step = crawl * dt;
      if (gap <= step) {
        // This stride would carry it past you: park it on your shoulder and
        // hand it over - or leave it waiting there while the chamber is full.
        bullet.x = this.px - ux * touch;
        bullet.y = this.py - uy * touch;
        bullet.angle = Math.atan2(uy, ux);
        this.tryCollect(bullet, i);
        continue;
      }
      bullet.x += ux * step;
      bullet.y += uy * step;
      bullet.angle = Math.atan2(uy, ux);
    }
  }

  /**
   * Ends a flight at the point it stopped: on the zombie it hit, or out at
   * max range if it missed. Boomerang makes it fly home instead of dropping.
   */
  private stopBullet(bullet: Bullet, slot: number, x: number, y: number): void {
    bullet.x = x;
    bullet.y = y;
    bullet.age = 0;
    bullet.state = boomerangEnabled(this.ups) ? 'return' : 'ground';
    this.spendBloodReturn(bullet, slot);
  }

  /** One promised Blood Frenzy bullet has come down: offer it to the hand. */
  private spendBloodReturn(bullet: Bullet, slot: number): void {
    if (this.bloodReturns <= 0) return;
    this.tryCollect(bullet, slot);
  }

  private tryCollect(bullet: Bullet, slot: number): void {
    if (this.held < chamberFor(this.ups)) {
      this.held += 1;
      // Any bullet that reaches the hand pays off one Blood Frenzy promise,
      // whether it was walked over or called back by a kill.
      if (this.bloodReturns > 0) this.bloodReturns -= 1;
      this.killBullet(slot);
      this.events.onBulletPickedUp({ x: bullet.x, y: bullet.y, held: this.held });
      return;
    }
    // Chamber full: a returning bullet drops where it arrived and waits.
    if (bullet.state === 'return') {
      bullet.state = 'ground';
      bullet.age = 0;
    }
  }

  private killBullet(slot: number): void {
    const bullet = this.bullets[slot];
    if (!bullet.alive) return;
    bullet.alive = false;
    this.bulletsAlive -= 1;
    this.bulletFree.push(slot);
  }

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
  private firstHit(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { x: number; y: number } | null {
    const list = this.candidates;
    list.length = 0;
    const pad = BULLET_RADIUS + MAX_ENEMY_RADIUS;
    this.hash.queryBox(
      Math.min(x0, x1) - pad,
      Math.min(y0, y1) - pad,
      Math.max(x0, x1) + pad,
      Math.max(y0, y1) + pad,
      list,
    );

    const segX = x1 - x0;
    const segY = y1 - y0;
    const lenSq = segX * segX + segY * segY;
    const damage = bulletDamageFor(this.ups);

    for (let i = 0; i < list.length; i++) {
      const index = list[i];
      const enemy = this.enemies[index];
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

      if (enemy.hp <= 0) this.killEnemy(index);
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
    const radius = explosiveRadiusFor(this.ups);
    if (radius <= 0) return;

    this.events.onExplosion({ x, y, radius });

    const list = this.blast;
    list.length = 0;
    this.hash.queryCircle(x, y, radius, list);

    const damage = bulletDamageFor(this.ups);
    const radiusSq = radius * radius;
    for (let i = 0; i < list.length; i++) {
      const index = list[i];
      if (index === direct) continue;
      const enemy = this.enemies[index];
      if (!enemy.alive) continue;
      if (distSq(enemy.x, enemy.y, x, y) > radiusSq) continue;

      enemy.hit = HIT_FLASH;
      enemy.hp -= damage;
      if (enemy.hp <= 0) this.killEnemy(index);
    }
  }

  private killEnemy(slot: number): void {
    const enemy = this.enemies[slot];
    if (!enemy.alive) return;

    enemy.alive = false;
    this.enemiesAlive -= 1;
    this.enemyFree.push(slot);
    this.kills += 1;
    this.points += ENEMY_STATS[enemy.kind].points;
    // XP is banked the instant it dies: nothing drops, nothing is collected.
    this.xp += enemy.xp;
    this.bloodFrenzyReturn();
    this.events.onEnemyKilled({ kind: enemy.kind, x: enemy.x, y: enemy.y, value: enemy.xp });
  }

  /**
   * Blood Frenzy (legendary): every kill hands a bullet straight back. The
   * nearest one lying out returns on the spot; if they are all still in the
   * air, the kill is banked and paid out as flights come down - one promise
   * per kill, never more than the chamber could hold.
   */
  private bloodFrenzyReturn(): void {
    if (!bloodFrenzyEnabled(this.ups) || this.held >= chamberFor(this.ups)) return;

    let best = -1;
    let bestSq = Infinity;
    for (let i = 0; i < BULLET_CAP; i++) {
      const bullet = this.bullets[i];
      if (!bullet.alive || bullet.state === 'flight') continue;
      const d = distSq(bullet.x, bullet.y, this.px, this.py);
      if (d < bestSq) {
        bestSq = d;
        best = i;
      }
    }

    if (best >= 0) {
      this.tryCollect(this.bullets[best], best);
      return;
    }
    if (this.bloodReturns < chamberFor(this.ups) - this.held) this.bloodReturns += 1;
  }

  // --- progression ---------------------------------------------------------

  private checkLevelUp(): void {
    if (this.offersList !== null) return;

    let need = xpNeededForLevel(this.level);
    while (this.xp >= need) {
      this.xp -= need;
      this.level += 1;

      const offers = this.rollOffers();
      if (offers.length > 0) {
        this.offersList = offers;
        this.events.onLevelUp({ level: this.level, offers });
        return;
      }
      need = xpNeededForLevel(this.level);
    }
  }

  /**
   * Three cards, rolled one slot at a time (Game Design Document, section 7):
   * 5 % for a Legendary, a further 3 % for a Super Rare, the rest Common.
   *
   * Every tier falls back to the next commonest one it can still fill, so a
   * late round whose commons are all capped never wastes a slot - and never
   * offers a card the wave has not unlocked, because `availableUpgrades`
   * gates by `unlockWave` before any of this runs.
   */
  private rollOffers(): UpgradeId[] {
    const legal = availableUpgrades(this.ups, this.hp, PLAYER_MAX_HP, this.wave.wave);
    const picked: UpgradeId[] = [];

    const takeFrom = (tier: Rarity): boolean => {
      const pool = rarityPool(legal, tier);
      if (pool.length === 0) return false;
      const def = pool[this.rng.pickInt(0, pool.length - 1)];
      const at = legal.indexOf(def);
      if (at >= 0) legal.splice(at, 1); // no duplicates inside one roll
      picked.push(def.id);
      return true;
    };

    for (let slot = 0; slot < 3 && legal.length > 0; slot++) {
      const roll = this.rng.pickFloat();
      if (roll < LEGENDARY_CHANCE && takeFrom('legendary')) continue;
      if (roll < LEGENDARY_CHANCE + SUPER_RARE_CHANCE && takeFrom('superRare')) continue;
      if (takeFrom('common')) continue;
      if (takeFrom('superRare')) continue;
      takeFrom('legendary');
    }
    return picked;
  }

  // --- ending --------------------------------------------------------------

  /**
   * The run ends only when the last heart goes. LAST BULLET is endless, so
   * the Result Panel always reports `win: true` (AGENTS.md section 4.2).
   */
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    this.win = true;
    this.offersList = null;
    this.dirty = true;

    this.events.onRunEnded({
      win: true,
      score: this.scoreNow(),
      kills: this.kills,
      level: this.level,
      wave: this.wave.wave,
      time: this.time,
    });
  }

  /** Kill points, plus 100 per wave cleared and 50 per level gained. */
  private scoreNow(): number {
    return scoreFor({
      points: this.points,
      wavesCleared: this.wave.wavesCleared,
      levelsGained: this.level - 1,
    });
  }

  // -------------------------------------------------------------------------
  // View frame
  // -------------------------------------------------------------------------

  private rebuild(): void {
    this.dirty = false;

    const frame = this.frame;
    frame.running = this.running;
    frame.win = this.win;
    frame.time = this.time;
    frame.wave = this.wave.wave;
    frame.phase = this.wave.phase;
    frame.phaseAge = this.wave.phaseAge;
    frame.breatherLeft = this.wave.breatherRemaining;
    frame.breatherTotal = this.wave.breatherDuration;
    frame.kills = this.kills;
    frame.level = this.level;
    frame.xp = this.xp;
    frame.xpNeeded = xpNeededForLevel(this.level);
    frame.score = this.scoreNow();
    frame.held = this.held;
    frame.chamber = chamberFor(this.ups);
    const stacks = frame.stacks;
    stacks.extraChamber = this.ups.extraChamber;
    stacks.quickHands = this.ups.quickHands;
    stacks.longBarrel = this.ups.longBarrel;
    stacks.magnet = this.ups.magnet;
    stacks.sprint = this.ups.sprint;
    stacks.mend = this.ups.mend;
    stacks.heavyRound = this.ups.heavyRound;
    stacks.boomerang = this.ups.boomerang;
    stacks.explosive = this.ups.explosive;
    stacks.secondWind = this.ups.secondWind;
    stacks.bloodFrenzy = this.ups.bloodFrenzy;
    frame.offers = this.offersList;

    const player = frame.player;
    player.x = this.px;
    player.y = this.py;
    player.hp = this.hp;
    player.maxHp = PLAYER_MAX_HP;
    player.invulnerable = this.invuln > 0;
    player.facing = this.facing;
    player.charge =
      this.held > 0 ? Math.min(1, Math.max(0, 1 - this.cooldown / shotDelayFor(this.ups))) : 0;

    frame.enemies.length = 0;
    for (let i = 0; i < ENEMY_CAP; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      const view = this.enemyViews[frame.enemies.length];
      view.id = enemy.id;
      view.kind = enemy.kind;
      view.x = enemy.x;
      view.y = enemy.y;
      view.radius = enemy.radius;
      view.hp = enemy.hp;
      view.maxHp = enemy.maxHp;
      view.hit = enemy.hit > 0 ? Math.min(1, enemy.hit / HIT_FLASH) : 0;
      frame.enemies.push(view);
    }

    frame.bullets.length = 0;
    for (let i = 0; i < BULLET_CAP; i++) {
      const bullet = this.bullets[i];
      if (!bullet.alive) continue;
      const view = this.bulletViews[frame.bullets.length];
      view.id = bullet.uid;
      view.state = bullet.state;
      view.x = bullet.x;
      view.y = bullet.y;
      view.angle = bullet.angle;
      view.age = bullet.age;
      frame.bullets.push(view);
    }
  }
}
