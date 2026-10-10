// pointerFeed.ts — binds Phaser's unified pointer input to the composition
// root's input adapters (§4.3). Phaser's Scene.input only exists once a scene
// exists, so the adapters can no longer attach to a DOM element themselves:
// the scenes — the render layer — own Phaser's input and forward it into the
// shared PointerFeed, while the adapters and the game stay Phaser-free.
//
// Touch is the primary scheme (§3.2). Phaser models touch and mouse as ONE
// pointer stream, so a desktop mouse click reaches the identical down/up path
// as a finger; there is deliberately no mouse-specific and no keyboard
// handling anywhere in this game.
//
// Safe to call from create(): a scene's InputPlugin drops its listeners when
// the scene shuts down (InputPlugin.shutdown → removeAllListeners), so a
// scene re-entered after a Retry re-registers exactly once.

import type { Input, Scene } from 'phaser';
import type { Point, PointerFeed } from '../core/types.ts';

/** Register this scene's pointer events into `feed`. Only scenes that can be
 *  played register (Play Screen, gameplay, Result Panel); Boot and Preloader
 *  need no input. */
export function forwardPointerInput(scene: Scene, feed: PointerFeed): void {
  // Phaser's pointer.x / pointer.y are canvas-space; rebuild client (screen)
  // coordinates so the adapters can run them through the GameSpace port
  // exactly like the raw touch path did with clientX/clientY (§4.3).
  const screenPoint = (pointer: Input.Pointer): Point => {
    const rect = scene.sys.canvas.getBoundingClientRect();
    return { x: rect.left + pointer.x, y: rect.top + pointer.y };
  };

  scene.input.on('pointerdown', (pointer: Input.Pointer) => {
    const { x, y } = screenPoint(pointer);
    feed.down(x, y);
  });
  // A press that starts off the canvas still begins a gesture (edge swipes).
  scene.input.on('pointerdownoutside', (pointer: Input.Pointer) => {
    const { x, y } = screenPoint(pointer);
    feed.down(x, y);
  });

  const onRelease = (pointer: Input.Pointer): void => {
    const { x, y } = screenPoint(pointer);
    feed.up(x, y);
  };

  scene.input.on('pointerup', onRelease);
  // Phaser emits `pointerup` OR `pointerupoutside`, never both: a gesture
  // released off the canvas still has to end here.
  scene.input.on('pointerupoutside', onRelease);
}
