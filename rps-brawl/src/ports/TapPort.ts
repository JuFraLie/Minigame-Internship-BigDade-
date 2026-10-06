import type { Sign } from '../core/types.ts';
import type { CardLayout } from './CardLayoutPort.ts';

/**
 * Inbound command: the player tapped a card.
 *
 * Implemented by the input adapter, consumed by the scenes. The renderer
 * hands over a screen point plus the layout it is currently using; the
 * adapter decides whether that point means anything to the game world.
 */
export interface TapPort {
  /**
   * @returns the sign whose card was tapped — but only when the game world
   * accepted the intent. Null means "nothing happened": the tap missed every
   * card, a reveal is already playing, or the run is over.
   */
  tapAt(x: number, y: number, layout: CardLayout): Sign | null;
}
