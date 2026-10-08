import type { Rarity, UpgradeId } from './types.ts';
import {
  BULLET_RANGE,
  CRAWL_SPEED,
  CRAWL_SPEED_STEP,
  DREAD_FLOOR,
  DREAD_STEP,
  EXPLOSIVE_RADIUS,
  EXPLOSIVE_RADIUS_STEP,
  FIRE_RANGE,
  GRIT_STEP,
  HEAVY_ROUND_SLOWDOWN,
  HOMING_STEP,
  INVULNERABLE_SECONDS,
  LONG_BARREL_STEP,
  MAX_CHAMBER,
  PLAYER_SPEED,
  RETURN_SPEED,
  RETURN_SPEED_STEP,
  SCORE_PER_LEVEL,
  SCORE_PER_WAVE,
  SHOCKWAVE_STEP,
  SHOT_DELAY,
  SHOT_DELAY_FACTOR,
  SPEED_RAMP_FROM_WAVE,
  SPEED_RAMP_MAX,
  SPEED_RAMP_STEP,
  SPRINT_STEP,
  SWEEP_RADIUS,
  THORNS_STEP,
  VARIANT_CHANCE_MAX,
  VARIANT_CHANCE_START,
  VARIANT_CHANCE_STEP,
  VARIANT_FROM_WAVE,
  WAVE_CAP,
  WAVE_SIZE_BASE,
  WAVE_SIZE_STEP,
  XP_BASE,
  XP_PER_LEVEL,
  PICKUP_RADIUS,
  PICKUP_RADIUS_STEP,
  SUPER_RARE_FROM_WAVE,
} from './config.ts';

/**
 * Pure rules: numbers in, numbers out. No state, no clock, no framework, so
 * every one of them is directly unit-testable.
 */

// --- progression -----------------------------------------------------------

/** XP required to leave `level`. Level 1 needs 6, level 2 needs 9, ... */
export const xpNeededForLevel = (level: number): number => XP_BASE + level * XP_PER_LEVEL;

export interface ScoreInput {
  /** Sum of the per-kill points (10 / 20 / 30) banked during the round. */
  readonly points: number;
  readonly wavesCleared: number;
  /** Levels taken above the starting level 1. */
  readonly levelsGained: number;
}

/** `points + waves cleared x 100 + levels gained x 50`. */
export const scoreFor = (input: ScoreInput): number =>
  input.points + input.wavesCleared * SCORE_PER_WAVE + input.levelsGained * SCORE_PER_LEVEL;

// --- waves -----------------------------------------------------------------

/** Zombies in `wave`: 4 x wave - 1, so 3, 7, 11, 15, ... capped at 120. */
export const waveSizeFor = (wave: number): number =>
  Math.min(WAVE_CAP, Math.max(0, WAVE_SIZE_STEP * wave + WAVE_SIZE_BASE));

/** Per-zombie chance of a Tank or Fast Zombie: 0 before wave 8, 4 % there, +1.5 % per wave. */
export const variantChanceFor = (wave: number): number => {
  if (wave < VARIANT_FROM_WAVE) return 0;
  const grown = VARIANT_CHANCE_START + VARIANT_CHANCE_STEP * (wave - VARIANT_FROM_WAVE);
  return Math.min(VARIANT_CHANCE_MAX, grown);
};

/** Speed multiplier for everything in `wave`: flat until 31, then +2 % per wave to +30 %. */
export const waveSpeedMultiplier = (wave: number): number => {
  const past = Math.max(0, wave - SPEED_RAMP_FROM_WAVE);
  return 1 + Math.min(SPEED_RAMP_MAX, SPEED_RAMP_STEP * past);
};

// --- upgrades --------------------------------------------------------------

export interface UpgradeState {
  extraChamber: number;
  quickHands: number;
  longBarrel: number;
  magnet: number;
  sprint: number;
  mend: number;
  heavyRound: number;
  grit: number;
  boomerang: number;
  shockwave: number;
  explosive: number;
  secondWind: number;
  bloodFrenzy: number;
  homing: number;
  thorns: number;
  dread: number;
}

export const initialUpgrades = (): UpgradeState => ({
  extraChamber: 0,
  quickHands: 0,
  longBarrel: 0,
  magnet: 0,
  sprint: 0,
  mend: 0,
  heavyRound: 0,
  grit: 0,
  boomerang: 0,
  shockwave: 0,
  explosive: 0,
  secondWind: 0,
  bloodFrenzy: 0,
  homing: 0,
  thorns: 0,
  dread: 0,
});

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly name: string;
  readonly blurb: string;
  /** Stacks allowed, including the first. `Infinity` means uncapped. */
  readonly max: number;
  /** Which rarity bucket this card is rolled from (GDD section 7). */
  readonly rarity: Rarity;
  /** First wave it may be offered at all; Legendaries unlock from wave 10 on. */
  readonly unlockWave: number;
  /** Mend only shows up while a heart can actually be restored. */
  readonly needsDamage: boolean;
}

/**
 * The card deck. Every stacking rule of the Game Design Document section 7
 * lives here; `availableUpgrades` is the single gate that enforces the caps,
 * the wave unlock and the Mend condition, so the world only ever has to decide
 * *which* eligible card a slot rolls - never whether one is legal.
 *
 * The deck is deliberately half open-ended and finite: `Infinity` cards are
 * the stack sinks a long run keeps paying into (Magnet, Mend, Explosive
 * Round), while every card with a number is meant to be *finished* - the
 * player should always be able to tell a card they are still building from
 * one they have taken as far as it goes.
 *
 * Nothing in here conflicts with anything else either: where two cards touch
 * the same idea they are made to multiply instead of cancel, the clearest
 * case being Boomerang and Magnet, which together sweep rounds up on the way
 * home - see `sweepRadiusFor`.
 */
export const UPGRADES: readonly UpgradeDef[] = [
  // --- commons: the cards a level-up leans on --------------------------------
  {
    id: 'extraChamber',
    name: 'EXTRA CHAMBER',
    blurb: '+1 bullet carried',
    max: MAX_CHAMBER - 1, // the chamber starts with one, tops out at six
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  {
    id: 'quickHands',
    name: 'QUICK HANDS',
    blurb: 'Shorter delay between shots',
    max: 4,
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  {
    id: 'longBarrel',
    name: 'LONG BARREL',
    blurb: '+90 shot range',
    max: 4, // past four stacks the shot already reaches off-screen
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  {
    id: 'magnet',
    name: 'BULLET MAGNET',
    blurb: 'Bullets crawl in from further',
    max: Infinity, // the pull is meant to be a stack sink: it never stops growing
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  {
    id: 'sprint',
    name: 'SPRINT',
    blurb: '+8% move speed',
    max: 4,
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  {
    id: 'mend',
    name: 'MEND',
    blurb: 'Restore 2 hearts',
    max: Infinity,
    rarity: 'common',
    unlockWave: 1,
    needsDamage: true,
  },
  {
    id: 'heavyRound',
    name: 'HEAVY ROUND',
    blurb: '2 damage, slower shots',
    max: 1,
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  {
    id: 'grit',
    name: 'GRIT',
    blurb: 'Longer invulnerability window',
    max: 3,
    rarity: 'common',
    unlockWave: 1,
    needsDamage: false,
  },
  // --- super rares: both the round trip and the crowd control ---------------
  {
    id: 'boomerang',
    name: 'BOOMERANG',
    blurb: 'Bullets fly back to you',
    max: 3, // extra stacks only make the return faster
    rarity: 'superRare',
    unlockWave: SUPER_RARE_FROM_WAVE,
    needsDamage: false,
  },
  {
    id: 'shockwave',
    name: 'SHOCKWAVE',
    blurb: 'Kills shove the horde back',
    max: 3,
    rarity: 'superRare',
    unlockWave: SUPER_RARE_FROM_WAVE,
    needsDamage: false,
  },
  // --- legendaries: the cards that change the shape of a run ----------------
  {
    id: 'explosive',
    name: 'EXPLOSIVE ROUND',
    blurb: 'Bullets explode on impact',
    max: Infinity, // the blast is a stack sink: every stack widens it
    rarity: 'legendary',
    unlockWave: 10, // each Legendary opens at its own wave, 10 to 18
    needsDamage: false,
  },
  {
    id: 'secondWind',
    name: 'SECOND WIND',
    blurb: 'Revive once with 3 hearts',
    max: 1,
    rarity: 'legendary',
    unlockWave: 12,
    needsDamage: false,
  },
  {
    id: 'bloodFrenzy',
    name: 'BLOOD FRENZY',
    blurb: 'Every kill returns your bullet',
    max: 1,
    rarity: 'legendary',
    unlockWave: 14,
    needsDamage: false,
  },
  {
    id: 'homing',
    name: 'HOMING ROUND',
    blurb: 'Bullets curve toward the horde',
    max: 3,
    rarity: 'legendary',
    unlockWave: 16,
    needsDamage: false,
  },
  {
    id: 'thorns',
    name: 'THORNS',
    blurb: 'Contact costs them 2 damage',
    max: 3,
    rarity: 'legendary',
    unlockWave: 16,
    needsDamage: false,
  },
  {
    id: 'dread',
    name: 'DREAD',
    blurb: 'Zombies move 7% slower',
    max: 5,
    rarity: 'legendary',
    unlockWave: 18,
    needsDamage: false,
  },
];

export const upgradeDef = (id: UpgradeId): UpgradeDef =>
  UPGRADES.find((def) => def.id === id) ?? UPGRADES[0];

/** Stacks taken of `id`, given the current upgrade state. */
export const stacksOf = (state: UpgradeState, id: UpgradeId): number => state[id];

/**
 * Cards legal to offer *right now*: under their cap, unlocked by the current
 * wave, and Mend only when hurt. Rarity is deliberately not applied here - the
 * world rolls it per card slot, so a slot that rolls a Legendary the player
 * cannot have yet can still fall back rather than waste the slot.
 */
export const availableUpgrades = (
  state: UpgradeState,
  hp: number,
  maxHp: number,
  wave: number,
): UpgradeDef[] =>
  UPGRADES.filter((def) => {
    if (state[def.id] >= def.max) return false;
    if (def.unlockWave > wave) return false;
    if (def.needsDamage && hp >= maxHp) return false;
    return true;
  });

/** The eligible cards of one rarity bucket. */
export const rarityPool = (
  defs: readonly UpgradeDef[],
  rarity: Rarity,
): UpgradeDef[] => defs.filter((def) => def.rarity === rarity);

// --- derived stats ---------------------------------------------------------

export const chamberFor = (state: UpgradeState): number => 1 + state.extraChamber;
export const shotDelayFor = (state: UpgradeState): number =>
  SHOT_DELAY * SHOT_DELAY_FACTOR ** state.quickHands * (state.heavyRound > 0 ? HEAVY_ROUND_SLOWDOWN : 1);
export const moveSpeedFor = (state: UpgradeState): number =>
  PLAYER_SPEED * (1 + SPRINT_STEP * state.sprint);
export const bulletDamageFor = (state: UpgradeState): number => (state.heavyRound > 0 ? 2 : 1);
/** Shot reach, and the auto-fire gate on it: Long Barrel moves both out together. */
export const bulletRangeFor = (state: UpgradeState): number =>
  BULLET_RANGE + LONG_BARREL_STEP * state.longBarrel;
export const fireRangeFor = (state: UpgradeState): number =>
  FIRE_RANGE + LONG_BARREL_STEP * state.longBarrel;
export const pickupRadiusFor = (state: UpgradeState): number =>
  PICKUP_RADIUS + PICKUP_RADIUS_STEP * state.magnet;
/**
 * How fast a grounded bullet inside the reach crawls home, `0` without any
 * Magnet stack - base pickup stays the walk-over it always was.
 */
export const crawlSpeedFor = (state: UpgradeState): number =>
  state.magnet > 0 ? CRAWL_SPEED + CRAWL_SPEED_STEP * state.magnet : 0;
export const returnSpeedFor = (state: UpgradeState): number =>
  RETURN_SPEED * (1 + RETURN_SPEED_STEP * state.boomerang);
export const boomerangEnabled = (state: UpgradeState): boolean => state.boomerang > 0;
/** 0 without Explosive Round, the blast radius with it - wider with every stack. */
export const explosiveRadiusFor = (state: UpgradeState): number =>
  state.explosive > 0
    ? EXPLOSIVE_RADIUS + EXPLOSIVE_RADIUS_STEP * (state.explosive - 1)
    : 0;
export const bloodFrenzyEnabled = (state: UpgradeState): boolean => state.bloodFrenzy > 0;

/** Grit: how long a hit leaves the survivor untouchable. */
export const invulnWindowFor = (state: UpgradeState): number =>
  INVULNERABLE_SECONDS + GRIT_STEP * state.grit;

/** Thorns: what touching the survivor costs the body that did it. */
export const thornsDamageFor = (state: UpgradeState): number => THORNS_STEP * state.thorns;

/**
 * Dread: the horde's pace as a share of the speed it was spawned with. The
 * floor keeps the card a slowdown and never a wall - a crowd that cannot
 * reach you is a crowd you cannot shoot.
 */
export const dreadPaceFor = (state: UpgradeState): number =>
  Math.max(DREAD_FLOOR, 1 - DREAD_STEP * state.dread);

/** Homing Round: how far per second a shot may bend toward its target. */
export const homingTurnFor = (state: UpgradeState): number => HOMING_STEP * state.homing;

/** Shockwave: how far a kill shoves every body standing near it. */
export const shockwavePushFor = (state: UpgradeState): number =>
  SHOCKWAVE_STEP * state.shockwave;

/**
 * Boomerang and Magnet *together*: the reach of the sweep a round performs on
 * its way home.
 *
 * Either card alone only moves its own round - Boomerang brings the round that
 * flew back, Magnet crawls in the round that fell within reach - so a round
 * lying out in the horde is beyond both. Both together is the only way to
 * collect it without walking into the crowd to fetch it, which is what makes
 * the pair worth more than the sum of its parts.
 */
export const sweepRadiusFor = (state: UpgradeState): number =>
  state.boomerang > 0 && state.magnet > 0 ? SWEEP_RADIUS : 0;
