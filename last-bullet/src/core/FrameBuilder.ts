import { BULLET_CAP, ENEMY_CAP, PLAYER_MAX_HP } from './config.ts';
import { HIT_FLASH, makeArray, type EnemyPool } from './entities.ts';
import type { Progression } from './Progression.ts';
import { initialUpgrades, xpNeededForLevel } from './rules.ts';
import type { Survivor } from './Survivor.ts';
import type { BulletView, EnemyView, WorldFrame } from './types.ts';
import type { WaveSpawner } from './WaveSpawner.ts';
import type { Weapon } from './Weapon.ts';

/**
 * The round-scalars the frame carries; owned by `GameWorld`.
 *
 * Fields are writable on purpose: `GameWorld` reuses one record and rewrites
 * it before every rebuild, so the read model costs no allocation either.
 */
export interface FrameRound {
  running: boolean;
  win: boolean;
  time: number;
}

/** Everything the read model is allowed to look at. */
export interface FrameSources {
  readonly enemies: EnemyPool;
  readonly weapon: Weapon;
  readonly survivor: Survivor;
  readonly progression: Progression;
  readonly waves: WaveSpawner;
}

/**
 * The view frame: the one object the whole rendering world reads.
 *
 * It copies, it never decides - no rule, no threshold and no rng lives here.
 * The frame and its view records are allocated once and rewritten in place,
 * so polling `getFrame()` every render frame costs nothing and never hands
 * the renderer a new object to chase.
 */
export class FrameBuilder {
  /** The frame itself: allocated once, rewritten in place, never replaced. */
  readonly frame: WorldFrame;
  private readonly enemyViews: EnemyView[];
  private readonly bulletViews: BulletView[];
  private readonly sources: FrameSources;

  constructor(sources: FrameSources) {
    this.sources = sources;

    this.enemyViews = makeArray(ENEMY_CAP, () => ({
      id: 0,
      kind: 'zombie' as const,
      x: 0,
      y: 0,
      radius: 0,
      hp: 0,
      maxHp: 0,
      hit: 0,
    }));
    this.bulletViews = makeArray(BULLET_CAP, () => ({
      id: 0,
      state: 'ground' as const,
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
      player: {
        x: 0,
        y: 0,
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        invulnerable: false,
        facing: sources.survivor.facing,
        charge: 1,
      },
      enemies: [],
      bullets: [],
    };
  }

  /** Rewrites the frame from `sources` and returns the very same object. */
  rebuild(round: FrameRound): WorldFrame {
    const { enemies, weapon, survivor, progression, waves } = this.sources;
    const frame = this.frame;

    frame.running = round.running;
    frame.win = round.win;
    frame.time = round.time;
    frame.wave = waves.wave;
    frame.phase = waves.phase;
    frame.phaseAge = waves.phaseAge;
    frame.breatherLeft = waves.breatherRemaining;
    frame.breatherTotal = waves.breatherDuration;
    frame.kills = progression.kills;
    frame.level = progression.level;
    frame.xp = progression.xp;
    frame.xpNeeded = progression.xpNeeded;
    frame.score = progression.score(waves.wavesCleared);
    frame.held = weapon.held;
    frame.chamber = weapon.chamber;
    const stacks = frame.stacks;
    stacks.extraChamber = progression.stacks.extraChamber;
    stacks.quickHands = progression.stacks.quickHands;
    stacks.longBarrel = progression.stacks.longBarrel;
    stacks.magnet = progression.stacks.magnet;
    stacks.sprint = progression.stacks.sprint;
    stacks.mend = progression.stacks.mend;
    stacks.heavyRound = progression.stacks.heavyRound;
    stacks.boomerang = progression.stacks.boomerang;
    stacks.explosive = progression.stacks.explosive;
    stacks.secondWind = progression.stacks.secondWind;
    stacks.bloodFrenzy = progression.stacks.bloodFrenzy;
    frame.offers = progression.pending;

    const player = frame.player;
    player.x = survivor.x;
    player.y = survivor.y;
    player.hp = survivor.hp;
    player.maxHp = PLAYER_MAX_HP;
    player.invulnerable = survivor.invulnerable;
    player.facing = survivor.facing;
    player.charge = weapon.charge;

    frame.enemies.length = 0;
    const bodies = enemies.items;
    for (let i = 0; i < bodies.length; i++) {
      const enemy = bodies[i];
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
    const shots = weapon.bullets.items;
    for (let i = 0; i < shots.length; i++) {
      const bullet = shots[i];
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

    return frame;
  }
}
