// knight.ts — the knight's simulation only: position, velocity, state machine
// and animation clock. Rendering lives in render/knightView.ts and sound
// effects are reported back to the controller as return values.

import { KNIGHT, PHYSICS } from '../config/gameConfig.ts';
import type { Rect } from '../core/types.ts';

export type KnightState = 'running' | 'jumping' | 'shielding';

export class Knight {
  x: number;
  y: number;
  vy = 0;
  groundY: number;
  state: KnightState = 'running';
  displayW: number;
  displayH: number;
  groundedY: number;
  frame = 0;
  invulnerableTimer = 0;

  private shieldTimer = 0;
  private frameTimer = 0;

  constructor(x: number, groundY: number, gameH: number) {
    this.x = x;
    this.groundY = groundY;

    // Sprite aspect ratio is 96 : 84 — size it from the playfield height.
    this.displayH = Math.round(gameH * KNIGHT.HEIGHT_RATIO);
    this.displayW = Math.round(this.displayH * (KNIGHT.FRAME_W / KNIGHT.FRAME_H));

    // Placing the sprite top at groundY − FEET_RATIO × height lands the feet
    // EXACTLY on the line; +1px seats the boots on the floor with no air gap.
    this.groundedY = Math.round(groundY - this.displayH * KNIGHT.FEET_RATIO) + 1;
    this.y = this.groundedY;
  }

  /**
   * @returns true when a jump actually started — the caller decides whether
   *          that is worth playing a sound for.
   */
  jump(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'jumping';
    this.vy = PHYSICS.JUMP_VELOCITY;
    this.frame = 0;
    this.frameTimer = 0;
    return true;
  }

  /** @returns true when the shield actually went up. */
  shield(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'shielding';
    this.shieldTimer = PHYSICS.SHIELD_DURATION;
    this.frame = 0;
    this.frameTimer = 0;
    return true;
  }

  /**
   * Left edge of the visible body — the point a pursuer would chase. The
   * sprite frame has a transparent margin on its left, so `x` itself would
   * measure empty air.
   */
  get heelX(): number {
    return this.x + this.displayW * KNIGHT.CHAR_MIN_X_RATIO;
  }

  get isShielding(): boolean {
    return this.state === 'shielding';
  }

  get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  hurt(duration: number): void {
    this.invulnerableTimer = duration;
  }

  update(dt: number): void {
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }

    // Recalculate the resting Y in case the floor moved (resize).
    this.groundedY = Math.round(this.groundY - this.displayH * KNIGHT.FEET_RATIO) + 1;

    if (this.state === 'jumping') {
      this.vy += PHYSICS.GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= this.groundedY) {
        this.y = this.groundedY;
        this.vy = 0;
        this.state = 'running';
        this.frame = 0;
      }
    } else if (this.state === 'shielding') {
      this.shieldTimer -= dt;
      this.y = this.groundedY;
      if (this.shieldTimer <= 0) {
        this.state = 'running';
        this.frame = 0;
      }
    } else {
      // Solidly grounded on the floor.
      this.y = this.groundedY;
    }

    this.frameTimer += dt;
    const duration = KNIGHT.FRAME_DURATION[this.state];
    if (this.frameTimer >= duration) {
      this.frameTimer -= duration;
      this.frame = (this.frame + 1) % KNIGHT.FRAMES[this.state];
    }
  }

  /**
   * Exact hitbox of the knight's body (empty frame margins excluded),
   * generously inset so close calls don't trigger unfair deaths.
   */
  getHitbox(): Rect {
    const charX = this.x + this.displayW * KNIGHT.CHAR_MIN_X_RATIO;
    const charY = this.y + this.displayH * KNIGHT.CHAR_MIN_Y_RATIO;
    const charW = this.displayW * KNIGHT.CHAR_WIDTH_RATIO;
    const charH = this.displayH * KNIGHT.CHAR_HEIGHT_RATIO;

    const insetX = charW * KNIGHT.HITBOX_INSET_X;
    const insetY = charH * KNIGHT.HITBOX_INSET_Y;

    return {
      x: charX + insetX,
      y: charY + insetY,
      w: charW - insetX * 2,
      h: charH - insetY * 2,
    };
  }
}
