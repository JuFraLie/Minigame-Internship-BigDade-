import type { RandomPort } from '../ports/RandomPort.ts';
import type { RenderPort } from '../ports/RenderPort.ts';
import type { UpgradePort } from '../ports/UpgradePort.ts';
import {
  ENEMY_CAP,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  SECOND_WIND_PUSH,
  SHOCKWAVE_REACH,
} from './config.ts';
import { CrowdField } from './CrowdField.ts';
import { EnemyWalk } from './EnemyWalk.ts';
import { EnemyPool, MAX_ENEMY_RADIUS } from './entities.ts';
import { distSq } from './geometry.ts';
import { FrameBuilder, type FrameRound } from './FrameBuilder.ts';
import { Progression } from './Progression.ts';
import {
  dreadPaceFor,
  invulnWindowFor,
  moveSpeedFor,
  shockwavePushFor,
  thornsDamageFor,
} from './rules.ts';
import { Survivor } from './Survivor.ts';
import type { UpgradeId, Vec2, WorldEventsPort, WorldFrame } from './types.ts';
import { WaveSpawner } from './WaveSpawner.ts';
import { Weapon, type KillSink } from './Weapon.ts';

/**
 * The game world: a pure-TypeScript endless-wave simulation, now kept as the
 * *orchestrator* of it.
 *
 * No Phaser, no pixels, no DOM, no clock of its own - it is stepped with an
 * explicit `dt` and a move vector, which is what lets a whole run be replayed
 * headless in the test suite. Each concern behind it lives in a module of its
 * own and knows nothing about the others:
 *
 *   WaveSpawner   what arrives, and where it stands
 *   EnemyWalk     how the horde moves and settles
 *   Survivor      the player's body: position, hearts, invulnerability
 *   Weapon        the chamber, the shots, their one hit and their return
 *   Progression   XP, levels, card stacks and the score
 *   CrowdField    the spatial index they all query
 *   FrameBuilder  the read model the renderer is handed
 *
 * What is left here is exactly what none of them may own: the order the step
 * runs in, the round itself (time, running, the end), and the two places
 * where concerns meet - a body going down, and a body touching the survivor.
 * It implements the two ports the renderer reads through: `RenderPort` (the
 * frame) and `UpgradePort` (the level-up handshake), plus the weapon's narrow
 * `KillSink`, because the accounting for a kill is a round-level fact.
 */
export class GameWorld implements RenderPort, UpgradePort, KillSink {
  // --- round ---------------------------------------------------------------
  private time = 0;
  private running = true;
  private win = false;
  private ended = false;
  /** Wave 1 is placed on the first step, when the view size is already known. */
  private started = false;

  // --- collaborators -------------------------------------------------------
  private readonly events: WorldEventsPort;
  private readonly enemies: EnemyPool;
  private readonly field: CrowdField;
  private readonly survivor: Survivor;
  private readonly progression: Progression;
  private readonly waves: WaveSpawner;
  private readonly walk: EnemyWalk;
  private readonly weapon: Weapon;
  private readonly frames: FrameBuilder;

  // --- scratch -------------------------------------------------------------
  /** Candidates for the contact test, reused so a step allocates nothing. */
  private readonly contact: number[] = [];
  /**
   * Shockwave shoves banked during a step, as `x, y, reach, force` runs.
   *
   * A kill mid-step may not move the crowd on the spot: the contact test runs
   * after the shots, and a body shoved onto the survivor on the way would cost
   * a heart for someone else's death. They are paid out at the head of the
   * next step instead, where the settlement pass runs over them before
   * anybody can be touched.
   */
  private readonly shoves: number[] = [];
  /** Reused record, so `getFrame()` never allocates either. */
  private readonly round: FrameRound = { running: true, win: false, time: 0 };
  private dirty = true;

  constructor(rng: RandomPort, events: WorldEventsPort) {
    // Plain fields rather than constructor parameter properties: Node's
    // `--experimental-strip-types` only erases types, so it cannot rewrite a
    // parameter into a field assignment.
    this.events = events;
    this.enemies = new EnemyPool(ENEMY_CAP);
    this.field = new CrowdField(ENEMY_CAP);
    this.survivor = new Survivor();
    this.progression = new Progression(rng, events);
    this.waves = new WaveSpawner(this.enemies, rng);
    this.walk = new EnemyWalk(this.enemies, this.field);
    this.weapon = new Weapon({
      enemies: this.enemies,
      field: this.field,
      survivor: this.survivor,
      progression: this.progression,
      events,
      kills: this,
    });
    this.frames = new FrameBuilder({
      enemies: this.enemies,
      weapon: this.weapon,
      survivor: this.survivor,
      progression: this.progression,
      waves: this.waves,
    });
  }

  // -------------------------------------------------------------------------
  // Ports
  // -------------------------------------------------------------------------

  getFrame(): WorldFrame {
    if (this.dirty) {
      this.dirty = false;
      this.round.running = this.running;
      this.round.win = this.win;
      this.round.time = this.time;
      this.frames.rebuild(this.round);
    }
    return this.frames.frame;
  }

  offers(): readonly UpgradeId[] | null {
    return this.progression.pending;
  }

  choose(id: UpgradeId): boolean {
    if (!this.progression.take(id)) return false;

    // The stack was taken; the card's *effect* lands on the body it changes.
    // The chamber card hands over the round it promises. Bullets are a
    // conserved pool - firing moves one out of the hand, collecting moves it
    // back - so growing the capacity alone would leave every extra slot empty
    // for the rest of the run. `held` cannot overshoot: it was at most the old
    // capacity, and the capacity has just grown by one.
    if (id === 'mend') this.survivor.heal(2);
    if (id === 'extraChamber') this.weapon.grantChamber();

    this.dirty = true;
    this.events.onUpgradeChosen({ id, level: this.progression.level });
    return true;
  }

  // -------------------------------------------------------------------------
  // Configuration and diagnostics
  // -------------------------------------------------------------------------

  /**
   * The visible play area in world units. The spawn ring sits just outside it
   * so enemies always arrive from off-screen, whatever the device is.
   */
  setViewSize(width: number, height: number): void {
    this.waves.setViewSize(width, height);
    this.dirty = true;
  }

  /** True while the simulation must not advance: level-up card or round over. */
  frozen(): boolean {
    return !this.running || this.progression.pending !== null;
  }

  /**
   * Live entity counts. Diagnostics for the test suite - the renderer reads
   * the frame, not these - but also the cheapest way to prove the pools stay
   * inside their caps for a whole round.
   */
  counts(): { enemies: number; bullets: number } {
    return { enemies: this.enemies.count, bullets: this.weapon.bullets.count };
  }

  /**
   * Diagnostics for the test suite, next to `counts()`: rings `count` zombies
   * around the player without going through the wave director. A performance
   * test can then measure a full 120-zombie wave without first playing thirty
   * waves to reach it. Returns how many were placed.
   */
  seedRing(count: number): number {
    const placed = this.waves.seedRing(count, this.survivor.x, this.survivor.y);
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
    this.progression.grant(id, stacks);
    this.dirty = true;
  }

  /**
   * Diagnostics for the test suite, next to `grantUpgrade`: deals a level-up
   * offering exactly these cards, so a card's own effect can be pinned down
   * without waiting for the roll to hand it over. The world freezes exactly
   * as a real level-up does until one of them is taken.
   */
  offerCards(ids: readonly UpgradeId[]): void {
    if (this.ended || this.progression.pending !== null || ids.length === 0) return;
    this.dirty = true;
    this.progression.offer(ids);
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  /**
   * One fixed step, in the order the simulation depends on: the survivor
   * moves, the wave answers, the horde walks and settles, the shots fly, and
   * only then does anything touch the survivor or the trigger.
   *
   * `move` is the normalised world-space drag vector, already converted from
   * screen space by the input adapter.
   */
  step(dt: number, move: Vec2): void {
    if (!this.running || this.progression.pending !== null) return;
    this.dirty = true;

    // First thing: whatever the last step's kills shoved, settled before
    // anything is allowed to read a position - see `shoves`.
    this.applyShoves();

    this.time += dt;

    // Wave 1 waits for the first step so the spawn ring is already the real
    // device's, not the constructor's default.
    if (!this.started) {
      this.started = true;
      this.waves.begin(this.survivor.x, this.survivor.y);
    }

    this.survivor.move(dt, move, moveSpeedFor(this.progression.stacks));
    this.survivor.tick(dt);
    this.weapon.tick(dt);

    this.waves.tick(dt, this.enemies.count, this.survivor.x, this.survivor.y);

    // Three rebuilds per step, each one answering a different question. This
    // one is "who stands where before anyone moves" - the walk below needs it
    // to tell an open path from a blocked one, spawns included.
    this.field.rebuild(this.enemies.items);
    this.walk.step(dt, this.survivor.x, this.survivor.y, dreadPaceFor(this.progression.stacks));

    // Now "where everyone ended up", so the crowd can be settled against the
    // real field, and once more afterwards: the bullet, contact and target
    // passes must see the field the renderer draws, not the pre-shove one.
    this.field.rebuild(this.enemies.items);
    this.walk.settle(this.survivor.x, this.survivor.y);
    this.field.rebuild(this.enemies.items);

    this.weapon.step(dt);
    if (!this.running) return;

    this.checkContact();
    if (!this.running) return;

    this.weapon.tryFire();
    this.progression.checkLevelUp(this.survivor.hp, this.waves.wave);
  }

  /**
   * Where the horde meets the survivor: the first body close enough to touch
   * costs a heart, opens the invulnerability window and reports the hit.
   *
   * Two cards are decided here too, both because they are facts about the
   * *round* rather than about the body:
   *
   *   Second Wind  whether a fatal hit ends the run - the survivor only says
   *                what the blow did, and this is where the crowd gets shoved
   *                clear of the body it just saved.
   *   Thorns       what the body that landed the touch pays for it, settled
   *                before the hit is reported so a listener reading the frame
   *                sees both halves of the exchange at once.
   *
   * Grit is not decided here - it only widens the window the survivor opens,
   * which is passed in like every other number this class hands the body.
   */
  private checkContact(): void {
    if (this.survivor.invulnerable) return;

    const list = this.contact;
    list.length = 0;
    this.field.queryCircle(
      this.survivor.x,
      this.survivor.y,
      PLAYER_RADIUS + MAX_ENEMY_RADIUS,
      list,
    );

    const spikes = thornsDamageFor(this.progression.stacks);

    for (let i = 0; i < list.length; i++) {
      const enemy = this.enemies.items[list[i]];
      if (!enemy.alive) continue;
      const reach = enemy.radius + PLAYER_RADIUS;
      if (distSq(enemy.x, enemy.y, this.survivor.x, this.survivor.y) > reach * reach) continue;

      const canRevive = !this.survivor.reviveSpent && this.progression.stacks.secondWind > 0;
      const outcome = this.survivor.hit(
        enemy.damage,
        canRevive,
        invulnWindowFor(this.progression.stacks),
      );

      // Thorns: the round is still running, so the touch is answered - a body
      // that dies of it is accounted for exactly like any other kill.
      if (spikes > 0 && outcome !== 'down') {
        enemy.hp -= spikes;
        if (enemy.hp <= 0) this.onEnemyDown(list[i]);
      }

      if (outcome === 'revived') {
        this.walk.repelFrom(this.survivor.x, this.survivor.y, SECOND_WIND_PUSH);
        this.events.onPlayerHit({ hp: this.survivor.hp, maxHp: PLAYER_MAX_HP });
        return;
      }

      this.events.onPlayerHit({ hp: this.survivor.hp, maxHp: PLAYER_MAX_HP });
      if (outcome === 'down') this.finish();
      return;
    }
  }

  /**
   * `KillSink`: a body's hp reached zero. Release it, pay for it, tell the
   * gun to make good on its Blood Frenzy promise, bank Shockwave's shove for
   * the next step, and only then report it - in that order, so a listener
   * that reads the frame sees the kill already banked.
   */
  onEnemyDown(slot: number): void {
    const enemy = this.enemies.release(slot);
    if (enemy === null) return;

    this.progression.bankKill(enemy);
    this.weapon.onKill();

    // Shockwave (super rare): the body's last position is the epicentre.
    // Queued, never applied here - see `shoves` for why.
    const push = shockwavePushFor(this.progression.stacks);
    if (push > 0) this.shoves.push(enemy.x, enemy.y, SHOCKWAVE_REACH, push);

    this.events.onEnemyKilled({ kind: enemy.kind, x: enemy.x, y: enemy.y, value: enemy.xp });
  }

  /** Pays every shove banked during the last step; see `shoves`. */
  private applyShoves(): void {
    const list = this.shoves;
    for (let i = 0; i < list.length; i += 4) {
      this.walk.pushFrom(list[i], list[i + 1], list[i + 2], list[i + 3]);
    }
    list.length = 0;
  }

  // -------------------------------------------------------------------------
  // Ending
  // -------------------------------------------------------------------------

  /**
   * The run ends only when the last heart goes. LAST BULLET is endless, so
   * the Result Panel always reports `win: true` (AGENTS.md section 4.2).
   */
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    this.win = true;
    this.progression.clearOffers();
    this.dirty = true;

    this.events.onRunEnded({
      win: true,
      score: this.progression.score(this.waves.wavesCleared),
      kills: this.progression.kills,
      level: this.progression.level,
      wave: this.waves.wave,
      time: this.time,
    });
  }
}
