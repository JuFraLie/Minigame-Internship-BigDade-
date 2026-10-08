import {
  LEGENDARY_CHANCE,
  PLAYER_MAX_HP,
  SUPER_RARE_CHANCE,
  ENEMY_STATS,
} from './config.ts';
import type { RandomPort } from '../ports/RandomPort.ts';
import {
  availableUpgrades,
  initialUpgrades,
  rarityPool,
  scoreFor,
  xpNeededForLevel,
  type UpgradeState,
} from './rules.ts';
import type { Enemy } from './entities.ts';
import type { Rarity, UpgradeId, WorldEventsPort } from './types.ts';

/**
 * Progression: the card stacks, the level the survivor is on, the XP behind
 * it, and the points a kill was worth.
 *
 * This is where "what am I allowed to be offered" and "what is this run
 * worth" live. The cards' *effects* deliberately do not - a heal belongs to
 * the survivor, an extra round to the chamber - so `GameWorld` applies those
 * at the one place where all three components already meet.
 */
export class Progression {
  /** Live stack record: rules read it directly, only this class writes it. */
  private readonly ups: UpgradeState = initialUpgrades();
  private levelValue = 1;
  private xpValue = 0;
  /** Banked kill points (10 / 20 / 30); waves and levels are added on read. */
  private points = 0;
  private killsValue = 0;
  private offersValue: UpgradeId[] | null = null;

  private readonly rng: RandomPort;
  private readonly events: WorldEventsPort;

  constructor(rng: RandomPort, events: WorldEventsPort) {
    this.rng = rng;
    this.events = events;
  }

  get stacks(): UpgradeState {
    return this.ups;
  }

  get level(): number {
    return this.levelValue;
  }

  get xp(): number {
    return this.xpValue;
  }

  get xpNeeded(): number {
    return xpNeededForLevel(this.levelValue);
  }

  get kills(): number {
    return this.killsValue;
  }

  /** The cards on offer, or null when no level-up is pending. */
  get pending(): UpgradeId[] | null {
    return this.offersValue;
  }

  /** One kill banked: its points, its XP, and the kill itself. */
  bankKill(enemy: Enemy): void {
    this.killsValue += 1;
    this.points += ENEMY_STATS[enemy.kind].points;
    // XP is banked the instant it dies: nothing drops, nothing is collected.
    this.xpValue += enemy.xp;
  }

  /** Test-suite hook: stacks only, never a card's side effect. */
  grant(id: UpgradeId, stacks: number): void {
    this.ups[id] = this.ups[id] + stacks;
  }

  /**
   * Accepts a pending card. The side effect of the card itself - Mend's heal,
   * Extra Chamber's round - belongs to the body it changes and is applied by
   * the world after this returns true.
   */
  take(id: UpgradeId): boolean {
    const pending = this.offersValue;
    if (pending === null || !pending.includes(id)) return false;

    this.ups[id] = this.ups[id] + 1;
    this.offersValue = null;
    return true;
  }

  /** Test-suite hook: deals exactly these cards instead of rolling them. */
  offer(ids: readonly UpgradeId[]): void {
    this.offersValue = [...ids];
    this.events.onLevelUp({ level: this.levelValue, offers: this.offersValue });
  }

  /** Whatever was on offer goes with the round that offered it. */
  clearOffers(): void {
    this.offersValue = null;
  }

  /**
   * Spends as much XP as the survivor has: each level crossed re-rolls the
   * offering, and the first non-empty roll freezes the world on it.
   *
   * `hp` and `wave` are passed in rather than read, because whether a card is
   * legal right now is a fact about the round, not about progression.
   */
  checkLevelUp(hp: number, wave: number): void {
    if (this.offersValue !== null) return;

    let need = xpNeededForLevel(this.levelValue);
    while (this.xpValue >= need) {
      this.xpValue -= need;
      this.levelValue += 1;

      const offers = this.rollOffers(hp, wave);
      if (offers.length > 0) {
        this.offersValue = offers;
        this.events.onLevelUp({ level: this.levelValue, offers });
        return;
      }
      need = xpNeededForLevel(this.levelValue);
    }
  }

  /** Kill points, plus 100 per wave cleared and 50 per level gained. */
  score(wavesCleared: number): number {
    return scoreFor({
      points: this.points,
      wavesCleared,
      levelsGained: this.levelValue - 1,
    });
  }

  /**
   * Three cards, rolled one slot at a time (Game Design Document, section 7):
   * 6 % for a Legendary, a further 4 % for a Super Rare, the rest Common.
   *
   * Every tier falls back to the next commonest one it can still fill, so a
   * late round whose commons are all capped never wastes a slot - and never
   * offers a card the wave has not unlocked, because `availableUpgrades`
   * gates by `unlockWave` before any of this runs. A roll that lands on a
   * tier with nothing unlocked in it yet simply walks down to the one that
   * has, which is why the odds can sit above the cards actually on offer.
   */
  private rollOffers(hp: number, wave: number): UpgradeId[] {
    const legal = availableUpgrades(this.ups, hp, PLAYER_MAX_HP, wave);
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
}
