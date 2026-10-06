/**
 * Inbound pointer intake, still in screen space.
 *
 * The `Game` scene forwards Phaser's pointer events straight through this
 * port; it is the input adapter that decides what a drag *means*. Coordinates
 * arrive in design-space pixels, already scaled by Phaser's input manager.
 *
 * Pointer ids matter: only the finger that put the stick down may move it, so
 * a stray second thumb cannot steer the player.
 */
export interface PointerPort {
  down(pointerId: number, x: number, y: number): void;
  move(pointerId: number, x: number, y: number): void;
  up(pointerId: number): void;
  /**
   * Drops the stick whatever the pointer id - used when the pointer leaves the
   * webview entirely and no `up` will ever arrive for it.
   */
  releaseAll(): void;
}
