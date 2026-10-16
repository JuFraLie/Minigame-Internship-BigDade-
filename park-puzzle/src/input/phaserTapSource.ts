import type Phaser from 'phaser';
import type { TapEvent } from './tapInput.ts';

/**
 * Adapter: Phaser pointers expressed in design-space coordinates.
 *
 * Phaser reports `pointer.x/y` in game units, which is exactly the space `layout.ts`
 * works in, so no scaling is needed here — only the promise that every press of the
 * finger is heard, including one that starts on the canvas and ends off it.
 */
export function phaserTapSource(scene: Phaser.Scene): (handler: (event: TapEvent) => void) => () => void {
    return (handler) => {
        const onDown = (pointer: Phaser.Input.Pointer): void => {
            handler({ x: pointer.x, y: pointer.y });
        };

        scene.input.on('pointerdown', onDown);
        return () => scene.input.off('pointerdown', onDown);
    };
}
