/**
 * Inbound command telling the game world that the reveal animation finished.
 *
 * Without it the world would have no notion of time: it advances purely on
 * taps and on this handshake, which is what keeps it deterministic and
 * runnable headless.
 */
export interface RevealPort {
  completeReveal(): boolean;
}
