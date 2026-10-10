// obstacles.ts — obstacle model + the spawn clock (simulation only).
// WHAT a trap is lives here (geometry + hitboxes); WHEN and HOW MANY come is
// decided by the pacing timeline (pacing.ts). Drawing lives in
// render/obstacleView.ts, collision resolution in game/collision.ts.

import { OBSTACLES } from '../config/gameConfig.ts';
import type { Rect, TrapPreview } from '../core/types.ts';
import {
  phaseFor,
  pickSpikeCount,
  pickSpikeHeight,
  pickTrap,
  spawnInterval,
  type Phase,
} from './pacing.ts';
import { scrollSpeed } from './scoring.ts';

export type TrapType = 'spike_cluster' | 'flyer' | 'arrow';

export interface Obstacle {
  type: TrapType;
  x: number;
  active: boolean;
  // spike_cluster
  spikeCount?: number; // 1-4 spikes
  spikeH?: number; // height of the tallest spike
  // flyer (bat)
  flyY?: number; // absolute playfield Y of the bat
  flyPhase?: number; // wing-flap animation phase
  // arrow (member of a vertical stack — the whole stack shares one x)
  arrowY?: number; // absolute playfield Y of this arrow's top edge
}

// ─── Hitboxes ────────────────────────────────────────────────────────────────
// Intentionally smaller than the art (generous / forgiving).

export function obstacleHitbox(obs: Obstacle, floorY: number): Rect {
  if (obs.type === 'spike_cluster') {
    const count = obs.spikeCount ?? 1;
    const h = obs.spikeH ?? 32;
    const totalW = count * OBSTACLES.SPIKE_W - OBSTACLES.SPIKE_OVERLAP;
    // Only the sharp tip zone counts.
    const insetX = totalW * OBSTACLES.SPIKE_HITBOX_INSET_X;
    const insetY = h * OBSTACLES.SPIKE_HITBOX_INSET_Y;
    return { x: obs.x + insetX, y: floorY - h + insetY, w: totalW - insetX * 2, h: h - insetY };
  }

  if (obs.type === 'flyer') {
    // Only the bat's tiny body core — wings are safe to clip through.
    const cx = obs.x + OBSTACLES.BAT_CENTER_DX;
    const cy = (obs.flyY ?? 0) + OBSTACLES.BAT_CENTER_DY;
    const r = OBSTACLES.BAT_HITBOX_RADIUS;
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }

  if (obs.type === 'arrow') {
    // The shaft only — inset relative to the drawn art so close calls pass.
    return {
      x: obs.x + (OBSTACLES.ARROW_W - OBSTACLES.ARROW_HIT_W) / 2,
      y: obs.arrowY ?? floorY - OBSTACLES.ARROW_Y_OFFSET,
      w: OBSTACLES.ARROW_HIT_W,
      h: OBSTACLES.ARROW_HIT_H,
    };
  }

  return { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * The lane a coin pattern traces for this trap — the coins ARE the answer.
 *
 * A spike cluster is answered by a jump, so its coins arc over the cluster; a
 * shield trap (arrow wall, low bat) by raising the block, so its coins sit in
 * the shield lane straight through it; a high bat by running under, so its
 * coins lie on the floor beneath it. Following the coins is then always the
 * right counter (see tests/coinTraps.test.ts).
 *
 * Returns the neutral TrapPreview contract, so the pickup layer never has to
 * know that obstacles exist (§4.3).
 */
export function trapPreview(obs: Obstacle, floorY: number): TrapPreview {
  if (obs.type === 'spike_cluster') {
    const count = obs.spikeCount ?? 1;
    return {
      counter: 'jump',
      x: obs.x,
      width: count * OBSTACLES.SPIKE_W - OBSTACLES.SPIKE_OVERLAP,
    };
  }

  if (obs.type === 'flyer') {
    // Above the low-bat line → the bat sails over him: run under it instead.
    const low = (obs.flyY ?? 0) > floorY - OBSTACLES.HIGH_BAT_OFFSET;
    return { counter: low ? 'shield' : 'run_under', x: obs.x + OBSTACLES.BAT_CENTER_DX, width: 0 };
  }

  // Arrow stack: every arrow shares one x, so the whole wall is one trap.
  return { counter: 'shield', x: obs.x, width: OBSTACLES.ARROW_W };
}

// ─── Spawner ─────────────────────────────────────────────────────────────────

export class ObstacleSpawner {
  obstacles: Obstacle[] = [];
  /**
   * True once the pacing timeline has rolled its first trap: from then on more
   * are always coming (see pacing.ts), which is what lets a due coin pattern
   * wait for one to belong to instead of paying out between two traps.
   */
  serving = false;
  // Grace period — no obstacles at the start, the player has time to get ready.
  private timer: number = OBSTACLES.GRACE_PERIOD;
  /** Phase the run is currently in; a change restarts the burst rhythm. */
  private phase: Phase = phaseFor(0);
  /** Spawns scheduled since that phase began — the position inside the LOOP. */
  private spawnIndex = 0;

  scroll(speed: number, dt: number): void {
    for (const obs of this.obstacles) obs.x -= speed * dt;
  }

  /** @returns the traps rolled this frame — they are born past the right edge. */
  update(dt: number, score: number, gameW: number, floorY: number): Obstacle[] {
    for (const obs of this.obstacles) {
      if (obs.x + OBSTACLES.CULL_MARGIN < 0) obs.active = false;
    }
    this.obstacles = this.obstacles.filter(o => o.active);

    this.timer -= dt;
    if (this.timer > 0) return [];

    const phase = phaseFor(score);
    if (phase !== this.phase) {
      // New segment of the timeline → its own rhythm starts from the top.
      this.phase = phase;
      this.spawnIndex = 0;
    }

    const spawned = this.spawn(phase, score, gameW, floorY);
    this.spawnIndex++;
    // The next gap (including the recovery before a new burst) comes straight
    // from the timeline; the roll only picks a spot inside it.
    this.timer = spawnInterval(phase, this.spawnIndex, Math.random());
    return spawned;
  }

  /** Advances purely cosmetic animation clocks (kept out of the renderer). */
  advanceAnimations(dt: number): void {
    for (const obs of this.obstacles) {
      if (obs.type !== 'flyer') continue;
      obs.flyPhase = ((obs.flyPhase ?? 0) + dt * OBSTACLES.WING_FLAP_SPEED) % (Math.PI * 2);
    }
  }

  private spawn(phase: Phase, score: number, gameW: number, floorY: number): Obstacle[] {
    // Spawn AT the warning distance: the danger marker then shows for the
    // whole DANGER_LEAD_SECONDS before the trap enters the playfield. Because
    // of that lead a newborn trap is ALWAYS past the right edge — which is
    // what makes it a safe place for a coin pattern to be born (pickups.ts).
    const lead = OBSTACLES.DANGER_LEAD_SECONDS * scrollSpeed(score);
    const spawnX = gameW + lead;

    // The menu decides WHICH trap — never a probability of its own.
    const trap = pickTrap(phase, Math.random());
    const born: Obstacle[] = [];

    if (trap === 'arrow') {
      // One stack: all the arrows of this spawn sit at the SAME x, one above
      // the other, from shin height up past the knight's maximum jump. They
      // arrive as a single wall, so no jump can ever clear it — only the
      // shield answers it (see tests/arrow.test.ts).
      for (let i = 0; i < OBSTACLES.ARROW_COUNT; i++) {
        const arrowY = floorY - (OBSTACLES.ARROW_Y_OFFSET + i * OBSTACLES.ARROW_STACK_SPACING);
        born.push({ type: 'arrow', x: spawnX, active: true, arrowY });
      }
    } else if (trap === 'flyer') {
      // Low bat: just above the floor → shield to deflect.
      // High bat: well above → run under safely.
      const flyY =
        Math.random() < OBSTACLES.LOW_BAT_CHANCE
          ? floorY - OBSTACLES.LOW_BAT_OFFSET
          : floorY - OBSTACLES.HIGH_BAT_OFFSET;

      born.push({ type: 'flyer', x: spawnX, active: true, flyY, flyPhase: 0 });
    } else {
      born.push({
        type: 'spike_cluster',
        x: spawnX,
        active: true,
        spikeCount: pickSpikeCount(phase, Math.random()),
        spikeH: pickSpikeHeight(phase, Math.random()),
      });
    }

    this.obstacles.push(...born);
    this.serving = true;
    return born;
  }
}
