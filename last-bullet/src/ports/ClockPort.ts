/**
 * Frame time for the fixed-timestep driver.
 *
 * The driver reads `deltaMs()`; the host that owns the frame - the Phaser
 * scene at runtime, a test - feeds it through `advance()`. Two implementations
 * exist: `FrameClock` (renderer side) and `ManualClock` (headless tests).
 *
 * Splitting "who owns the frame" from "who consumes the time" is what lets the
 * simulation run at exactly 30 Hz whether it is being drawn or not.
 */
export interface ClockPort {
  /** Called with the milliseconds elapsed since the previous frame. */
  advance(deltaMs: number): void;
  /** Milliseconds the driver should simulate; clamped by the implementation. */
  deltaMs(): number;
}
