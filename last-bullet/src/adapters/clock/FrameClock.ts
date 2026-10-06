import type { ClockPort } from '../../ports/ClockPort.ts';

/**
 * `ClockPort` as the renderer sees it: the scene feeds each frame's `delta`
 * in, the fixed-step driver reads it back out. The driver - not this class -
 * applies the frame clamp, so a stall can never fast-forward the round.
 */
export class FrameClock implements ClockPort {
  private ms = 0;

  advance(deltaMs: number): void {
    this.ms = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  }

  deltaMs(): number {
    return this.ms;
  }
}
