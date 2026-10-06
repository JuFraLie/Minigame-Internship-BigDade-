import type { InputPort } from './InputPort.ts';
import type { KeyboardPort } from './KeyboardPort.ts';
import type { PointerPort } from './PointerPort.ts';
import type { RenderPort } from './RenderPort.ts';
import type { UpgradePort } from './UpgradePort.ts';

/**
 * One round, as handed to the `Game` scene.
 *
 * A read-only window onto the world, the level-up handshake, the frame pump
 * and the view size the spawn ring is derived from. The scene receives this
 * bundle and never sees the `GameWorld` behind it.
 */
export interface SessionPort {
  /** Read-only view of the game world. */
  readonly render: RenderPort;
  /** Level-up offers and card selection. */
  readonly upgrades: UpgradePort;
  /** Where Phaser's pointer events go, still in screen space. */
  readonly pointer: PointerPort;
  /** Where the held key state goes, still in screen directions. */
  readonly keyboard: KeyboardPort;
  /** Move vector and floating-stick geometry, for the renderer to draw. */
  readonly input: InputPort;
  /**
   * Advances the simulation by one rendered frame. The caller must not call
   * this while a level-up overlay or the pause overlay is on screen - that is
   * what freezes the round.
   */
  frame(deltaMs: number): void;
  /**
   * The visible play area in world units, reported on create and on resize.
   * The world uses it to place the spawn ring just outside the screen.
   */
  setViewSize(width: number, height: number): void;
}
