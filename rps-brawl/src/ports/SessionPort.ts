import type { GameViewPort } from './GameViewPort.ts';
import type { RevealPort } from './RevealPort.ts';
import type { TapPort } from './TapPort.ts';

/**
 * One run, as handed to the renderer.
 *
 * Three ports, no behaviour: a read-only window into the world, the
 * handshake that ends a reveal, and the way taps get in. The scenes receive
 * this bundle and never see the `GameCore` behind it.
 */
export interface SessionPort {
  /** Read-only view of the game world. */
  readonly view: GameViewPort;
  /** Tells the world the reveal finished. */
  readonly reveal: RevealPort;
  /** Screen taps, translated into picks. */
  readonly tap: TapPort;
}
