// pickups.ts — the pickup items (coins and hearts): model, hitbox, spawn clock
// and the lane a pattern is laid out in. The clock says WHEN a pattern is
// offered; the trap the knight meets next says WHERE it sits (see
// spawnTrapPattern) — the two components only meet through TrapPreview.
// Pure domain logic: no rendering, no audio, no DOM — it only knows about the
// game world, so it runs headless exactly like every other part of game/.

import { PICKUPS } from '../config/gameConfig.ts';
import type { Rect, TrapPreview } from '../core/types.ts';

export type PickupType = 'coin' | 'heart';

/** The three ways a coin pattern can be laid out along the corridor. */
export type CoinPattern = 'ground_line' | 'air_line' | 'arc';

export interface Pickup {
  type: PickupType;
  /** Left/right position in game-world px; scrolls with the world. */
  x: number;
  y: number;
  /** Resting Y — the reference a floating heart bobs around. */
  baseY: number;
  active: boolean;
  /** Radius in px of the drawn disc (the collect box is a bit larger). */
  radius: number;
  /** Animation clock in radians: the coin spin / the heart bob. */
  animPhase: number;
}

/**
 * Collect box of a pickup: the drawn disc PLUS `PICKUPS.COLLECT_BONUS`.
 *
 * Deliberately generous — a jump through a pattern has to take the WHOLE line,
 * so a coin is never stranded just outside the pixels you can see.
 */
export function pickupHitbox(p: Pickup): Rect {
  const r = p.radius + PICKUPS.COLLECT_BONUS;
  return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
}

export class PickupSpawner {
  pickups: Pickup[] = [];
  private timer: number = PICKUPS.SPAWN_INTERVAL_MIN;
  /** How long the due offer has been waiting for a trap it could belong to. */
  private hold = 0;

  private nextInterval(): number {
    return (
      PICKUPS.SPAWN_INTERVAL_MIN +
      Math.random() * (PICKUPS.SPAWN_INTERVAL_MAX - PICKUPS.SPAWN_INTERVAL_MIN)
    );
  }

  /** Moves every pickup with the world — pickups never run on their own. */
  scroll(speed: number, dt: number): void {
    for (const p of this.pickups) {
      p.x -= speed * dt;
    }
  }

  /** Ticks the visual clocks: the coin spin and the heart bob (also off-run). */
  advanceAnimations(dt: number): void {
    for (const p of this.pickups) {
      if (p.type === 'coin') {
        p.animPhase = (p.animPhase + dt * PICKUPS.COIN_SPIN_SPEED) % (Math.PI * 2);
      } else {
        p.animPhase = (p.animPhase + dt * PICKUPS.HEART_FLOAT_SPEED) % (Math.PI * 2);
        p.y = p.baseY + Math.sin(p.animPhase) * PICKUPS.HEART_FLOAT_AMP;
      }
    }
  }

  /**
   * @param trap a trap the timeline rolled THIS frame (born past the right
   *   edge): a due pattern is laid out in the lane that clears it and is born
   *   off screen beside it.
   * @param serving the timeline is rolling, so more traps are coming — a due
   *   offer then waits for the next one instead of paying out in the gap
   *   between two traps. Only a corridor with no timeline at all waits
   *   PICKUPS.TRAP_ALIGN_WAIT seconds and then pays out on its own, so the
   *   clock can never stall — it still only decides WHEN, never how hard the
   *   run is.
   */
  update(
    dt: number,
    gameW: number,
    floorY: number,
    trap: TrapPreview | null = null,
    serving = false,
  ): void {
    this.cull();
    this.advanceAnimations(dt);

    this.timer -= dt;
    if (this.timer > 0) return;

    if (trap === null) {
      if (serving) return;
      this.hold += dt;
      if (this.hold < PICKUPS.TRAP_ALIGN_WAIT) return;
    }

    this.timer = this.nextInterval();
    this.hold = 0;
    if (trap !== null) this.spawnTrapPattern(trap, floorY);
    else this.spawnRandomCoinPattern(gameW, floorY);
  }

  /** Drops a heart at running height, just past the right edge of the screen. */
  spawnHeart(gameW: number, floorY: number): void {
    const y = floorY - PICKUPS.HEART_SPAWN_OFFSET;
    this.pickups.push({
      type: 'heart',
      x: gameW + PICKUPS.SPAWN_MARGIN,
      y,
      baseY: y,
      active: true,
      radius: PICKUPS.HEART_RADIUS,
      animPhase: Math.random() * Math.PI * 2,
    });
  }

  /** Removes everything that has scrolled out of the playfield. */
  private cull(): void {
    for (const p of this.pickups) {
      if (p.x + PICKUPS.CULL_MARGIN < 0) p.active = false;
    }
    this.pickups = this.pickups.filter(p => p.active);
  }

  private spawnRandomCoinPattern(gameW: number, floorY: number): void {
    const roll = Math.random();
    const pattern: CoinPattern = roll < 0.35 ? 'ground_line' : roll < 0.7 ? 'air_line' : 'arc';

    const startX = gameW + PICKUPS.SPAWN_MARGIN;
    if (pattern === 'ground_line') this.spawnLine(startX, floorY - PICKUPS.GROUND_COIN_OFFSET);
    else if (pattern === 'air_line') this.spawnLine(startX, floorY - PICKUPS.AIR_COIN_OFFSET);
    else this.spawnArc(startX, floorY);
  }

  /**
   * Lays a pattern in the lane that CLEARS `trap` — the coins are the answer,
   * so following them is always the right counter:
   *
   *  - `jump`      … an arc that starts before the hazard, peaks over its
   *                  middle and lands beyond it (nothing inside the cluster);
   *  - `shield`    … a short line at shield height straddling the trap, taken
   *                  by running straight through the block;
   *  - `run_under` … coins on the floor beneath the hazard, swept while he
   *                  simply keeps running.
   *
   * Same sizes and same heights as a free pattern (PICKUPS) — only WHERE they
   * sit is decided by the trap. The caller only offers a trap still outside
   * the right edge, so the pattern is always born off screen, never mid-run.
   */
  private spawnTrapPattern(trap: TrapPreview, floorY: number): void {
    const centre = trap.x + trap.width / 2;

    if (trap.counter === 'jump') {
      this.spawnArc(
        trap.x - PICKUPS.COIN_SPACING,
        floorY,
        trap.x + trap.width + PICKUPS.COIN_SPACING,
      );
      return;
    }

    const lane = trap.counter === 'shield' ? PICKUPS.SHIELD_COIN_OFFSET : PICKUPS.GROUND_COIN_OFFSET;
    const y = floorY - lane;
    const span = PICKUPS.COIN_MAX_PER_PATTERN - PICKUPS.COIN_MIN_PER_PATTERN + 1;
    const count = PICKUPS.COIN_MIN_PER_PATTERN + Math.floor(Math.random() * span);
    const startX = centre - ((count - 1) * PICKUPS.COIN_SPACING) / 2;

    for (let i = 0; i < count; i++) this.pushCoin(startX + i * PICKUPS.COIN_SPACING, y, i * 0.4);
  }

  /** A straight run of coins at `y` — collectible at that height alone. */
  private spawnLine(startX: number, y: number): void {
    const span = PICKUPS.COIN_MAX_PER_PATTERN - PICKUPS.COIN_MIN_PER_PATTERN + 1;
    const count = PICKUPS.COIN_MIN_PER_PATTERN + Math.floor(Math.random() * span);

    for (let i = 0; i < count; i++) {
      this.pushCoin(startX + i * PICKUPS.COIN_SPACING, y, i * 0.4);
    }
  }

  /** A parabola from the floor up to the arc peak and back down again. */
  private spawnArc(startX: number, floorY: number, endX?: number): void {
    const groundY = floorY - PICKUPS.GROUND_COIN_OFFSET;
    const peakH = PICKUPS.ARC_PEAK_OFFSET - PICKUPS.GROUND_COIN_OFFSET;
    const count = PICKUPS.ARC_COIN_COUNT;
    const span = (endX ?? startX + (count - 1) * PICKUPS.COIN_SPACING) - startX;

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      // Inverted parabola: 4 · t · (1 − t) reaches 1 exactly at the top.
      this.pushCoin(startX + t * span, groundY - 4 * t * (1 - t) * peakH, i * 0.3);
    }
  }

  private pushCoin(x: number, y: number, phase: number): void {
    this.pickups.push({
      type: 'coin',
      x,
      y,
      baseY: y,
      active: true,
      radius: PICKUPS.COIN_RADIUS,
      animPhase: phase % (Math.PI * 2),
    });
  }
}
