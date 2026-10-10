// boss.ts — the chaser: a big demon running just behind the knight, like the
// cop in Subway Surfers. Pure decoration — it never feeds collisions, scoring
// or input, so it can look menacing without ever bothering the player.
// Simulation only (gap, position, animation clock); drawing lives in
// render/bossView.ts.

import { BOSS } from '../config/gameConfig.ts';

/** What the controller reports about the world each frame. */
export interface ChaseContext {
  /** Left edge of the knight's visible body — the point being chased (world px). */
  heelX: number;
  /** Current world scroll speed (px/s); 0 freezes the walk cycle. */
  worldSpeed: number;
  /** 0..1 how far the run has ramped up: he closes in as the speed grows. */
  progress: number;
  /** The run ended: he creeps up to the knight and stops at his heels. */
  caught: boolean;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);

export class Boss {
  x: number; // left edge of his nominal box (world px), set on every update
  readonly W: number;
  readonly H: number;
  frame = 0;

  /** Distance from the knight's heel back to his right edge (world px). */
  gap: number;

  private phase = 0; // patrol clock (seconds)
  private lungeTimer = 0;
  private frameTimer = 0;

  constructor(corridorH: number, heelX: number) {
    this.H = Math.round(corridorH * BOSS.HEIGHT_RATIO);
    this.W = Math.round(this.H * BOSS.WIDTH_RATIO);
    this.gap = BOSS.GAP_FAR; // a fresh run starts with him far behind
    this.x = heelX - this.gap - this.W; // never rendered ahead of the knight
  }

  get rightEdge(): number {
    return this.x + this.W;
  }

  /** Milestone surge: he lunges to the near gap, then eases back to patrol. */
  lunge(): void {
    this.lungeTimer = BOSS.LUNGE_DURATION;
  }

  update(dt: number, ctx: ChaseContext): void {
    const d = Math.max(dt, 0);
    this.phase += d;
    if (this.lungeTimer > 0) this.lungeTimer -= d;

    // Patrol: a speed-driven baseline plus two sine waves, so he bobs back and
    // forth without ever moving in a straight line.
    const baseline = BOSS.GAP_FAR + (BOSS.GAP_NEAR - BOSS.GAP_FAR) * clamp01(ctx.progress);
    const patrol =
      baseline +
      Math.sin((this.phase / BOSS.PATROL_PERIOD_SLOW) * TAU) * BOSS.PATROL_AMP_SLOW +
      Math.sin((this.phase / BOSS.PATROL_PERIOD_FAST) * TAU + 1.7) * BOSS.PATROL_AMP_FAST;

    const target =
      ctx.caught || this.lungeTimer > 0
        ? BOSS.GAP_NEAR
        : clamp(patrol, BOSS.GAP_NEAR, BOSS.GAP_FAR);

    const moving = Math.abs(target - this.gap) > 0.5;
    const ease = 1 - Math.exp(-(ctx.caught ? BOSS.CATCH_LERP_RATE : BOSS.LERP_RATE) * d);
    this.gap = clamp(this.gap + (target - this.gap) * ease, BOSS.GAP_NEAR, BOSS.GAP_FAR);
    this.x = ctx.heelX - this.gap - this.W;

    // Walk cycle: matches the world speed while it scrolls, and keeps stepping
    // while he creeps up after the run ended (the world is frozen by then).
    const animRate =
      ctx.worldSpeed > 0 ? ctx.worldSpeed / BOSS.ANIM_REFERENCE_SPEED : moving ? 1 : 0;
    this.frameTimer += d * animRate;
    while (this.frameTimer >= BOSS.FRAME_DURATION) {
      this.frameTimer -= BOSS.FRAME_DURATION;
      this.frame = (this.frame + 1) % BOSS.FRAMES;
    }
  }
}
