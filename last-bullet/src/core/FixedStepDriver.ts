import type { ClockPort } from '../ports/ClockPort.ts';
import type { InputPort } from '../ports/InputPort.ts';
import { FIXED_STEP, MAX_FRAME_MS } from './config.ts';
import type { Vec2 } from './types.ts';

/** Hard ceiling on steps per frame; the frame clamp already keeps it at 3. */
const MAX_STEPS = 4;
const STEP_MS = FIXED_STEP * 1000;

/**
 * Fixed-timestep driver: turns variable frame time into a rock-steady 30 Hz.
 *
 * Rendering may run at 24, 60 or 120 FPS - the simulation takes the same
 * `1/30 s` steps either way, which is what keeps movement, spawn rates and
 * tick cost measurable and comparable between runs. Leftover time is carried
 * into the next frame rather than dropped, so the round keeps real-world pace.
 */
export class FixedStepDriver {
  private accumulator = 0;
  // Declared explicitly rather than as constructor parameter properties: the
  // test suite runs the sources through Node's type stripper, which only
  // erases types and cannot rewrite a parameter into a field assignment.
  private readonly clock: ClockPort;
  private readonly input: InputPort;

  constructor(clock: ClockPort, input: InputPort) {
    this.clock = clock;
    this.input = input;
  }

  /**
   * Consumes the frame's clock and runs however many whole steps it owed.
   *
   * @param step invoked once per fixed step with `1/30 s` and the current
   * world-space move vector, sampled once per frame so every step of a frame
   * sees the same input.
   */
  run(step: (dt: number, move: Vec2) => void): void {
    // A stalled tab or a long GC pause must not fast-forward the round.
    this.accumulator += Math.max(0, Math.min(this.clock.deltaMs(), MAX_FRAME_MS));

    const move = this.input.getMove();
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      this.accumulator -= STEP_MS;
      step(FIXED_STEP, move);
      steps++;
    }

    if (steps === MAX_STEPS) this.accumulator = 0;
  }

  /** Drops any carried-over time; used when the round is reset. */
  reset(): void {
    this.accumulator = 0;
  }
}
