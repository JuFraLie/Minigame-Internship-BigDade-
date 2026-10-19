import Phaser from 'phaser';
import type { TapEvent } from './tapInput.ts';

/**
 * Adapts a Phaser pointerdown to the game's `TapEvent`.
 *
 * The tap is taken in WORLD units, not `pointer.x/y`. The game is sized at
 * `width x device density` and `applyRenderScale` zooms the camera by the same density, so
 * `pointer.x` comes back in backing-store pixels — a design-space cell of 72 arrives as 180
 * at dpr 2.5, and every tap lands several cells away from the finger (or off the board and
 * gets dropped). `worldX/worldY` invert the camera matrix, so they come back in the design
 * units that `screenToCell` expects.
 *
 * `hitTestPointer` writes those fields before `POINTER_DOWN` is emitted, and the camera
 * matrix is rebuilt during the render that runs in the frame the scene starts — so they are
 * always current by the time a player can tap.
 */
export function phaserTapSource(scene: Phaser.Scene) {
    return (handler: (event: TapEvent) => void): (() => void) => {
        const onDown = (pointer: Phaser.Input.Pointer): void => {
            handler({ x: pointer.worldX, y: pointer.worldY });
        };

        scene.input.on(Phaser.Input.Events.POINTER_DOWN, onDown);
        return () => scene.input.off(Phaser.Input.Events.POINTER_DOWN, onDown);
    };
}
