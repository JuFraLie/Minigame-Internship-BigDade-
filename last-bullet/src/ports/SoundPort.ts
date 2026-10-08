/**
 * Outbound commands for everything the player hears.
 *
 * Two families of cue:
 *
 * - **BGM** — one looping track, held through the whole session. It starts on
 *   the Play gesture, holds its position while paused, and rewinds when the run
 *   ends so a Retry begins the round with a fresh downbeat.
 * - **SFX** — one call per audible moment. The cues are named after the moment
 *   rather than the file, because there are no files: the adapter synthesises
 *   every sound at runtime (AGENTS.md section 3.4 - nothing is fetched).
 *
 * Implemented by the Web Audio adapter; consumed by the scenes. The game world
 * never knows that sound exists - the renderer decides when a cue plays, so
 * audio stays a pure presentation concern (AGENTS.md section 4.3).
 */
export interface SoundPort {
  /**
   * Resumes the audio context. Must be called from a user gesture, otherwise
   * mobile WebViews keep everything silent.
   */
  unlock(): void;

  // -- background music -----------------------------------------------------

  /** Starts the loop from the top; a no-op while it is already running. */
  startMusic(): void;
  /** Silences the music but keeps its position, for the pause overlay. */
  pauseMusic(): void;
  /** Continues from where `pauseMusic` held it. */
  resumeMusic(): void;
  /** Silences the music and rewinds it, so the next round starts at bar one. */
  stopMusic(): void;

  // -- sound effects --------------------------------------------------------

  /** The revolver cracks. */
  shot(): void;
  /** The dropped bullet is back in the chamber. */
  pickup(): void;
  /** A zombie drops; the pitch wanders so a horde never sounds like one click. */
  kill(): void;
  /** The player takes damage. */
  playerHit(): void;
  /** Explosive Round's blast. */
  explosion(): void;
  /** The XP bar filled - the level-up overlay is about to open. */
  levelUp(): void;
  /** A card was taken. */
  upgrade(): void;
  /** A new wave's spawn landed. */
  wave(): void;
  /** The run is over - the stinger over which the Result Panel opens. */
  gameOver(): void;
  /** Any button press: Play, Pause, Resume, Retry. */
  ui(): void;
}
