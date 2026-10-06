import type { Sign } from '../core/types.ts';

/**
 * Inbound intents. The only way anything outside the game world can
 * influence it.
 *
 * `pickSign` reports whether the intent was accepted: it is ignored while a
 * reveal is playing and after the run has ended.
 */
export interface InputIntentPort {
  pickSign(sign: Sign): boolean;
}
