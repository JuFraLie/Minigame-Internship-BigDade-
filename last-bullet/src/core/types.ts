/**
 * Value types shared across the game world, the ports and the renderer.
 *
 * This module is pure data: no Phaser, no DOM, no adapters. Everything here is
 * either a small record or a discriminated union, so the whole codebase can
 * talk about the same shapes without importing an implementation.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type EnemyKind = 'zombie' | 'fast' | 'tank';

/**
 * The four states of a bullet (Game Design Document, section 4).
 *
 * - `flight`  it is travelling outward. The first zombie it touches stops it
 *             dead - a bullet never pierces - and it drops right there, in the
 *             middle of the horde.
 * - `return`  Boomerang upgrade: it flies back instead of dropping, both after
 *             a hit and at max range.
 * - `ground`  it landed and waits to be walked over, for the rest of the round.
 *
 * "Held" is deliberately *not* a bullet state: held bullets are a counter on
 * the player, which is what makes the chamber capacity meaningful.
 */
export type BulletState = 'flight' | 'return' | 'ground';

/**
 * Where the wave lifecycle stands. The spawn of a wave is instantaneous - the
 * whole wave appears in one tick - so the renderer only ever observes these
 * two phases.
 */
export type WavePhase = 'fight' | 'breather';

/**
 * How hard a card is to find (Game Design Document, section 7).
 *
 * Rarity only decides *when a slot rolls one*: it never changes what the card
 * does. The rolls themselves live in `GameWorld.rollOffers`.
 */
export type Rarity = 'common' | 'superRare' | 'legendary';

export type UpgradeId =
  | 'extraChamber'
  | 'quickHands'
  | 'longBarrel'
  | 'magnet'
  | 'sprint'
  | 'mend'
  | 'heavyRound'
  | 'boomerang'
  | 'explosive'
  | 'secondWind'
  | 'bloodFrenzy';

// ---------------------------------------------------------------------------
// View snapshots - what the renderer is allowed to see
// ---------------------------------------------------------------------------

export interface EnemyView {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** 0..1, seconds-since-hit normalised: presentation uses it for a hit pop. */
  hit: number;
}

export interface BulletView {
  id: number;
  state: BulletState;
  x: number;
  y: number;
  /** Travel direction in radians, so the renderer can orient the sprite. */
  angle: number;
  /** Seconds the bullet has been lying around; drives the pickup pulse. */
  age: number;
}

export interface PlayerView {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invulnerable: boolean;
  facing: number;
  /** 0..1 firing cooldown progress; the HUD uses it as an "armed" readout. */
  charge: number;
}

/**
 * How many stacks of each upgrade have been taken. Mirrors the world's own
 * upgrade state into the frame so the card overlay can show `3 / 4` without
 * reaching past the port.
 */
export type UpgradeStacks = Record<UpgradeId, number>;

/**
 * One immutable-looking frame of the game world.
 *
 * The object and its arrays are owned by the world and are rewritten in place
 * on every change, so reading a frame costs no allocation. Consumers must treat
 * the contents as valid for the current frame only.
 */
export interface WorldFrame {
  /** False once the round has ended; the Result Panel is already showing. */
  running: boolean;
  /** Final outcome of the round. Only meaningful once `running` is false. */
  win: boolean;
  /** Seconds elapsed in the round. */
  time: number;
  /** The wave being fought, counting from 1. */
  wave: number;
  /** `fight` while zombies are alive, `breather` while the next wave is brewing. */
  phase: WavePhase;
  /** Seconds spent in the current phase; drives the wave banner. */
  phaseAge: number;
  /** Seconds left in the breather, and its full length. 0 outside a breather. */
  breatherLeft: number;
  breatherTotal: number;
  kills: number;
  level: number;
  xp: number;
  xpNeeded: number;
  /** Kill points + 100 per wave cleared + 50 per level gained. */
  score: number;
  /** Bullets currently carried, and how many the chamber holds. */
  held: number;
  chamber: number;
  /** Stacks taken so far, for the `3 / 4` readout on a card. */
  stacks: UpgradeStacks;
  /** The three cards on offer while the simulation is frozen for a level-up. */
  offers: readonly UpgradeId[] | null;
  player: PlayerView;
  enemies: EnemyView[];
  bullets: BulletView[];
}

// ---------------------------------------------------------------------------
// Events - one-way notifications from the world to its listeners
// ---------------------------------------------------------------------------

export interface RunEndedEvent {
  /** Always true: LAST BULLET is endless, so it only ever ends by death. */
  win: boolean;
  score: number;
  kills: number;
  level: number;
  /** The wave the player died in. */
  wave: number;
  time: number;
}

export interface LevelUpEvent {
  level: number;
  offers: readonly UpgradeId[];
}

export interface EnemyKilledEvent {
  kind: EnemyKind;
  x: number;
  y: number;
  value: number;
}

export interface PlayerHitEvent {
  hp: number;
  maxHp: number;
}

export interface BulletFiredEvent {
  x: number;
  y: number;
  angle: number;
  held: number;
}

export interface BulletPickedUpEvent {
  x: number;
  y: number;
  held: number;
}

/** Explosive Round: a bullet stopped somewhere and took the block with it. */
export interface ExplosionEvent {
  x: number;
  y: number;
  /** Blast radius in world units - the ring is drawn to exactly this size. */
  radius: number;
}

export interface UpgradeChosenEvent {
  id: UpgradeId;
  level: number;
}

/**
 * Outbound events emitted by the game world.
 *
 * The renderer and the host bridge both react to these; neither of them is
 * allowed to push anything back in.
 */
export interface WorldEventsPort {
  /** Fires exactly once per round, at the same moment the Result Panel shows. */
  onRunEnded(event: RunEndedEvent): void;
  /** Fires when the XP bar fills; the world is frozen until a card is picked. */
  onLevelUp(event: LevelUpEvent): void;
  onEnemyKilled(event: EnemyKilledEvent): void;
  onPlayerHit(event: PlayerHitEvent): void;
  onBulletFired(event: BulletFiredEvent): void;
  onBulletPickedUp(event: BulletPickedUpEvent): void;
  onExplosion(event: ExplosionEvent): void;
  onUpgradeChosen(event: UpgradeChosenEvent): void;
}
