import type { GameEventsPort } from '../ports/GameEventsPort.ts';
import type { GameViewPort } from '../ports/GameViewPort.ts';
import type { InputIntentPort } from '../ports/InputIntentPort.ts';
import type { RandomPort } from '../ports/RandomPort.ts';
import type { ClashResult, GamePhase, GameSnapshot, Sign } from './types.ts';
import { multiplierForStreak, pointsForStreak, resolveClash } from './RpsRules.ts';

/**
 * The whole game world: the hidden enemy pick, clash resolution, hearts,
 * streak, multiplier and score.
 *
 * Deliberately free of clocks, timers, pixels and DOM — it advances only when
 * someone taps a card (`pickSign`) or tells it the reveal finished
 * (`completeReveal`), so a whole run can be simulated headless in
 * milliseconds.
 */
export class GameCore implements InputIntentPort, GameViewPort {
  static readonly MAX_HEARTS = 5;

  private readonly events: GameEventsPort;
  private readonly random: RandomPort;

  private phase: GamePhase = 'CHOOSING';
  private hearts = GameCore.MAX_HEARTS;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private enemyId = 1;
  private enemySign: Sign;
  private lastResult: ClashResult | null = null;
  private runEnded = false;

  constructor(events: GameEventsPort, random: RandomPort) {
    this.events = events;
    this.random = random;
    this.enemySign = random.pickSign();
  }

  // ── InputIntentPort ───────────────────────────────────────────────────────

  /**
   * The player taps a card. Accepted only while waiting for a choice; a
   * double tap during the reveal, or anything after game over, is ignored.
   *
   * @returns true when the tap was accepted.
   */
  pickSign(sign: Sign): boolean {
    if (this.phase !== 'CHOOSING') return false;

    const enemySign = this.enemySign;
    const result = resolveClash(sign, enemySign);
    this.phase = 'RESOLVING';
    this.lastResult = result;

    this.events.onSignRevealed({ playerSign: sign, enemySign, result });

    if (result === 'WIN') {
      this.streak += 1;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      const multiplier = multiplierForStreak(this.streak);
      const points = pointsForStreak(this.streak);
      this.score += points;
      this.events.onEnemyDefeated({
        enemyId: this.enemyId,
        points,
        multiplier,
        streak: this.streak,
        score: this.score,
      });
    } else if (result === 'LOSE') {
      const streakLost = this.streak;
      this.hearts -= 1;
      this.streak = 0;
      this.events.onHeartLost({
        heartsLeft: this.hearts,
        streakLost,
        runOver: this.hearts <= 0,
      });
    } else {
      this.events.onClashTied({ streak: this.streak, heartsLeft: this.hearts });
    }

    return true;
  }

  // ── Renderer → world handshake ────────────────────────────────────────────

  /**
   * The reveal animation finished. Rolls the next pick and, when the last
   * heart was spent, ends the run (emitting `RunEnded` exactly once).
   *
   * @returns true when the state actually advanced.
   */
  completeReveal(): boolean {
    if (this.phase !== 'RESOLVING') return false;

    if (this.hearts <= 0) {
      this.phase = 'ENDED';
      if (!this.runEnded) {
        this.runEnded = true;
        this.events.onRunEnded({ score: this.score, bestStreak: this.bestStreak });
      }
      return true;
    }

    // A win brings in a fresh enemy; a loss or a tie lets the same one pick again.
    this.enemySign = this.random.pickSign();
    if (this.lastResult === 'WIN') this.enemyId += 1;

    this.lastResult = null;
    this.phase = 'CHOOSING';
    return true;
  }

  // ── GameViewPort ──────────────────────────────────────────────────────────

  getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      hearts: this.hearts,
      maxHearts: GameCore.MAX_HEARTS,
      score: this.score,
      streak: this.streak,
      multiplier: multiplierForStreak(this.streak),
      bestStreak: this.bestStreak,
      enemyId: this.enemyId,
    };
  }
}
