import type { GameSnapshot } from '../core/types.ts';

/**
 * Read-only window into the game world. The renderer may look, never touch.
 */
export interface GameViewPort {
  getSnapshot(): GameSnapshot;
}
