import type { EnemyKind } from './types.ts';

/**
 * Every tunable number of LAST BULLET, in one place.
 *
 * World units are pixels-at-zoom-1: the design space is derived from the
 * device, so a unit is roughly a screen pixel. Nothing here knows about the
 * renderer - these are game-world values only.
 */

// --- round -----------------------------------------------------------------

/** Fixed simulation step: 30 Hz, decoupled from the render rate. */
export const FIXED_STEP = 1 / 30;
/** Frames longer than this are clamped so a stall cannot fast-forward the round. */
export const MAX_FRAME_MS = 100;

// --- player ----------------------------------------------------------------

export const PLAYER_RADIUS = 16;
/** Base move speed. Sprint adds 8 % per stack. */
export const PLAYER_SPEED = 145;
export const PLAYER_MAX_HP = 5;
/** Invulnerability window after a hit. */
export const INVULNERABLE_SECONDS = 0.8;

// --- bullet ----------------------------------------------------------------

/**
 * Auto-fire only considers enemies inside this radius. Short on purpose: the
 * revolver is a close-quarters weapon, and Long Barrel is the only way to
 * push the line out.
 */
export const FIRE_RANGE = 210;
/** The bullet keeps flying this far before it drops (or returns). */
export const BULLET_RANGE = 260;
/** Long Barrel pushes both the shot and the auto-fire gate this far per stack. */
export const LONG_BARREL_STEP = 90;
export const BULLET_SPEED = 620;
export const BULLET_RADIUS = 7;
/** Seconds between two shots at zero Quick Hands stacks. */
export const SHOT_DELAY = 0.6;
/** Each Quick Hands stack multiplies the shot delay by this. */
export const SHOT_DELAY_FACTOR = 0.85;
/**
 * Heavy Round's price: a heavy slug is slower to chamber, so it multiplies
 * the shot delay by this. Keeps the card a rate-versus-damage trade against
 * Quick Hands instead of a free upgrade.
 */
export const HEAVY_ROUND_SLOWDOWN = 1.2;
/** Boomerang return speed, +25 % per stack. */
export const RETURN_SPEED = 700;
export const RETURN_SPEED_STEP = 0.25;
/** Ground pickup radius; Magnet adds 34 per stack. */
export const PICKUP_RADIUS = 46;
export const PICKUP_RADIUS_STEP = 34;
/**
 * Magnet: a bullet inside the reach does not leap into the hand - it crawls
 * home at this speed, +40 per stack, and is taken only once it touches you.
 * There is no stack limit on the card, so neither is there on the pull.
 *
 * The first stack lands at 175, already well over `PLAYER_SPEED` (145): a
 * pulled bullet always gets back to the chamber faster than walking over to
 * it would, which is the whole point of picking the card.
 */
export const CRAWL_SPEED = 135;
export const CRAWL_SPEED_STEP = 40;
/** Sprint's per-stack speed bonus. */
export const SPRINT_STEP = 0.08;
/** Explosive Round: zombies within this of the impact take the same damage. */
export const EXPLOSIVE_RADIUS = 96;

// --- legendary upgrades -----------------------------------------------------

/** Second Wind revives the player with this many hearts, once per round. */
export const SECOND_WIND_HEARTS = 3;
/** Everything this close to the player is shoved this far away on the revive. */
export const SECOND_WIND_PUSH = 240;
/** Invulnerability granted by the revive, longer than a plain hit. */
export const SECOND_WIND_INVULN = 1.5;

// --- card rarity ------------------------------------------------------------

/** First wave a Super Rare card may be drawn, and its chance per card slot. */
export const SUPER_RARE_FROM_WAVE = 12;
export const SUPER_RARE_CHANCE = 0.03;
/** Chance of a Legendary card per slot, once at least one is unlocked. */
export const LEGENDARY_CHANCE = 0.05;

// --- entities --------------------------------------------------------------

/**
 * Pool size, and with it the largest wave: 120 zombies are pre-allocated, so
 * spawning a whole capped wave in one tick allocates nothing.
 */
export const ENEMY_CAP = 120;
export const BULLET_CAP = 48;
/** Chamber capacity ceiling - Extra Chamber tops out at 6 bullets carried. */
export const MAX_CHAMBER = 6;

export interface EnemyStats {
  readonly hp: number;
  readonly speed: number;
  readonly radius: number;
  /** Contact damage, applied once per invulnerability window. */
  readonly damage: number;
  /** XP granted the instant it dies - there is nothing to walk over. */
  readonly xp: number;
  /** Score this enemy is worth when it dies. */
  readonly points: number;
}

/**
 * Speeds are quoted against `PLAYER_SPEED`: the shambler sits at 60 %, the
 * sprinter just over the player so it punishes a wasted bullet, the tank at
 * 40 % but big enough to block a corridor and costly enough to respect - it
 * takes three unupgraded bullets, and every one of them is a pickup.
 */
export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
  zombie: { hp: 1, speed: 87, radius: 15, damage: 1, xp: 1, points: 10 },
  fast: { hp: 1, speed: 160, radius: 13, damage: 1, xp: 2, points: 20 },
  tank: { hp: 3, speed: 58, radius: 23, damage: 2, xp: 5, points: 30 },
};

/**
 * Body-overlap passes per step. One pass of pair corrections leaves a packed
 * crowd a body or two still touching, because undoing one gap can reopen the
 * gap behind it; a second pass settles the chain. Two is enough for the worst
 * case the pool allows (a full 120-zombie pile) because the walk itself no
 * longer deepens the pile - see `CROWD_PRESSURE`.
 */
export const SEPARATION_PASSES = 3;

/**
 * How far a homing step may reach *past* the body standing in front of it.
 *
 * Zero would lock the horde up: the front rank stops at the survivor and
 * every rank behind it stops on the rank in front, a static wall that never
 * shuffles. Some pressure keeps it leaning instead - each rank presses a
 * little into the next, the separation pass pushes it back out, and the crowd
 * reads as alive.
 *
 * It is also what bounds how much one step may deepen an overlap: a rank can
 * close on the rank ahead by at most this much, so the relaxation passes are
 * always handed something small to settle rather than a wall to tear down.
 */
export const CROWD_PRESSURE = 0.75;

/**
 * How far a zombie is allowed to sink into the survivor, in world units.
 *
 * The walk stops them just short of contact rather than exactly on it, so the
 * contact test - a plain `<=` against the same reach - can never be decided by
 * a rounding error. Deep enough to be unmissable, shallow enough that it
 * reads as standing against them rather than inside them.
 */
export const CONTACT_SINK = 0.25;

// --- waves -----------------------------------------------------------------

/** Zombies in a wave: `WAVE_SIZE_STEP x wave + WAVE_SIZE_BASE`, i.e. 3, 7, 11, ... */
export const WAVE_SIZE_STEP = 4;
export const WAVE_SIZE_BASE = -1;
/** Wave size ceiling; equal to the pool size, so one wave always fits. */
export const WAVE_CAP = 120;
/** Breather after a wave is cleared, rolled per wave. */
export const BREATHER_MIN = 3;
export const BREATHER_MAX = 5;
/** Extra radius spread across one wave, so arrivals stagger naturally. */
export const SPAWN_LAG = 110;
/** Spawn ring radius is this much wider than the visible half-diagonal. */
export const SPAWN_RING_MARGIN = 70;

/** First wave that may contain a Tank or Fast Zombie, as a per-zombie chance. */
export const VARIANT_FROM_WAVE = 8;
export const VARIANT_CHANCE_START = 0.04;
export const VARIANT_CHANCE_STEP = 0.015;
export const VARIANT_CHANCE_MAX = 0.2;

/** Late-game ramp: +2 % zombie speed per wave after wave 31, capped at +30 %. */
export const SPEED_RAMP_FROM_WAVE = 31;
export const SPEED_RAMP_STEP = 0.02;
export const SPEED_RAMP_MAX = 0.3;

// --- progression -----------------------------------------------------------

/** XP required to leave `level`: 3 + level x 3. */
export const XP_BASE = 3;
export const XP_PER_LEVEL = 3;
/** Score weights on top of the per-kill points in `ENEMY_STATS`. */
export const SCORE_PER_WAVE = 100;
export const SCORE_PER_LEVEL = 50;
