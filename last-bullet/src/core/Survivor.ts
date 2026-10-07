import {
  INVULNERABLE_SECONDS,
  PLAYER_MAX_HP,
  SECOND_WIND_HEARTS,
  SECOND_WIND_INVULN,
} from './config.ts';
import type { Vec2 } from './types.ts';

/**
 * The survivor's body: where it stands, which way it faces, how many hearts
 * it has left and for how long a hit is still fresh.
 *
 * The survivor never looks at the horde and never reads the upgrade stacks -
 * the world hands it a move vector, a speed and a damage number, and gets an
 * outcome back. That keeps the player's rules (speed, hearts, invulnerability,
 * Second Wind) in one file, and the consequences of those rules - shoving the
 * crowd, ending the round, reporting the hit - with the component that owns
 * them.
 */

/** What a hit did to the survivor; the world decides what each one means. */
export type HitOutcome = 'wounded' | 'revived' | 'down';

export class Survivor {
  x = 0;
  y = 0;
  hp = PLAYER_MAX_HP;
  facing = -Math.PI / 2;

  /** Seconds left of the post-hit invulnerability window. */
  private window = 0;
  /** Second Wind has already been spent this round. */
  private revived = false;

  get invulnerable(): boolean {
    return this.window > 0;
  }

  get reviveSpent(): boolean {
    return this.revived;
  }

  /**
   * One step of movement. `move` is the normalised world-space drag vector,
   * already converted from screen space by the input adapter; `speed` comes
   * from the upgrade stacks, which this body deliberately does not read.
   */
  move(dt: number, move: Vec2, speed: number): void {
    let mx = move.x;
    let my = move.y;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag <= 0.001) return;

    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    this.x += mx * speed * dt;
    this.y += my * speed * dt;
    this.facing = Math.atan2(my, mx);
  }

  /** Ticks the invulnerability window down; it never goes below zero. */
  tick(dt: number): void {
    if (this.window > 0) this.window = Math.max(0, this.window - dt);
  }

  /** Aims the body - the shot sets it too, because the gun is where it looks. */
  face(angle: number): void {
    this.facing = angle;
  }

  /** Mend: restores up to a full set of hearts. */
  heal(amount: number): void {
    this.hp = Math.min(PLAYER_MAX_HP, this.hp + amount);
  }

  /**
   * Takes `damage`. The window is opened for the ordinary outcome and for the
   * fatal one - the round is over, but the last frame still reads as a body
   * that has just been hit.
   *
   * Second Wind (legendary): when `canRevive` and the hit would have been
   * fatal, the card is burned instead of the run - three hearts, a longer
   * window, and `revived` so it can only happen once. Score, wave, level and
   * upgrades carry on untouched, so this is a revive inside the round and
   * never a restart.
   */
  hit(damage: number, canRevive: boolean): HitOutcome {
    this.hp = Math.max(0, this.hp - damage);

    if (this.hp <= 0 && canRevive) {
      this.revived = true;
      this.hp = SECOND_WIND_HEARTS;
      this.window = SECOND_WIND_INVULN;
      return 'revived';
    }

    this.window = INVULNERABLE_SECONDS;
    return this.hp <= 0 ? 'down' : 'wounded';
  }
}
