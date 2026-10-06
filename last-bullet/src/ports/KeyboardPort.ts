/**
 * Which screen directions the keys are currently holding.
 *
 * The scene rewrites one stable object in place every rendered frame, so
 * polling it costs no allocation.
 */
export interface KeyState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Inbound keyboard intake, still in screen directions.
 *
 * Symmetrical to `PointerPort`: the `Game` scene reads Phaser's key objects
 * and reports the held state through this port, while the input adapter
 * decides what holding a key *means*. No Phaser type crosses the boundary and
 * the simulation never learns that a keyboard exists (AGENTS.md section 4.3).
 *
 * Keyboard steering is an exception to AGENTS.md section 3.2, granted by the
 * core developer. Touch drag remains the primary scheme and is untouched.
 */
export interface KeyboardPort {
  /**
   * Reports which directions are held. Called once per rendered frame; a
   * direction that is no longer held simply comes back false, so a keyup that
   * never arrives (focus lost mid-hold) can never leave the player walking.
   */
  setHeld(state: KeyState): void;
}
