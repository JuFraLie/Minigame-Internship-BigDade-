import type { Scene } from 'phaser';

/**
 * When things happen during a reveal.
 *
 * The game world has no clock at all — it advances on taps and on the
 * `completeReveal()` handshake — so every beat of the animation lives here,
 * in the rendering world. `GameScene` only says *what* happens at each beat;
 * this class decides *when*.
 */
export const TIMING = {
  /** Beat before the enemy starts flipping its sign. */
  BEAT_MS: 170,
  /** One half of the badge flip (out, then back in). */
  FLIP_MS: 150,
  /** Beat between the finished flip and the WIN / LOSE / TIE banner. */
  OUTCOME_DELAY_MS: 70,
  /** How long the banner stays up. */
  BANNER_HOLD_MS: 640,
  /** Camera shake on a loss. */
  SHAKE_MS: 260,
  /** Pause between the banner and the next enemy. */
  RESOLVE_MS: 240,
  /** Pause between game over and the Result Panel. */
  PANEL_DELAY_MS: 620,
} as const;

/** The four beats of one reveal, in the order they fire. */
export interface RevealBeat {
  /** The enemy's sign starts flipping over. */
  onBeat(): void;
  /** The flip has landed: show the result and everything that follows it. */
  onOutcome(): void;
  /** The banner has had its moment. */
  onBannerEnd(): void;
  /** Hand control back to the game world. */
  onResolve(): void;
}

export class RevealTimeline {
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Schedules one full reveal, relative to now. */
  schedule(beat: RevealBeat): void {
    const { BEAT_MS, FLIP_MS, OUTCOME_DELAY_MS, BANNER_HOLD_MS, RESOLVE_MS } = TIMING;
    const revealDone = BEAT_MS + FLIP_MS * 2 + OUTCOME_DELAY_MS;

    this.scene.time.delayedCall(BEAT_MS, beat.onBeat);
    this.scene.time.delayedCall(revealDone, beat.onOutcome);
    this.scene.time.delayedCall(revealDone + BANNER_HOLD_MS, beat.onBannerEnd);
    this.scene.time.delayedCall(revealDone + BANNER_HOLD_MS + RESOLVE_MS, beat.onResolve);
  }
}
