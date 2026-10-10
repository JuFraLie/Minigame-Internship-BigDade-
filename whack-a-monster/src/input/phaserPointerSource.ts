import type Phaser from 'phaser';
import type { PointerHandler, PointerSource } from './pointerInput.ts';

/**
 * Adapter: turns Phaser pointers into a plain `PointerSource`.
 *
 * A Phaser `pointer.x/y` lives in *game* pixels (design size times the render scale), while
 * the layout works in design units. `Camera.getWorldPoint` applies exactly the inverse of
 * what the camera does when drawing (origin 0,0 plus the render zoom), so the value handed
 * to `PointerInput` is already in the space `layout.ts` expects.
 *
 * The conversion lives here so `pointerInput.ts` stays free of Phaser and testable headless.
 */
export function phaserPointerSource(scene: Phaser.Scene): PointerSource {
    const designPoint = (pointer: Phaser.Input.Pointer): { x: number; y: number } =>
        scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

    /**
     * Phaser reports a press or a release *exactly once*, choosing between the event for
     * "on the canvas" and the one for "outside the canvas" (`InputPlugin.processDownEvents`
     * / `processUpEvents`, keyed on `pointer.downElement` / `pointer.upElement`). Listening
     * to only the on-canvas half silently drops any gesture whose first or last sample lands
     * off the canvas: the drag is opened and never closed, so nothing reaches the round.
     *
     * A tap is stationary, so it always stays on the pixel it started on and never trips
     * this; a swipe is a long motion whose endpoint drifts, which is why only swiping broke.
     * The game letterboxes on purpose (`designSize` clamps the aspect), so the canvas edge
     * sits inside the window and is easy to cross.
     */
    const subscribe = (
        events: readonly string[],
        handler: PointerHandler,
    ): (() => void) => {
        const disposers = events.map((event) => {
            const listener = (pointer: Phaser.Input.Pointer): void => {
                const point = designPoint(pointer);
                // The pointer's id travels with it: `PointerInput` keeps one running
                // gesture per contact, which is what stops a second thumb (or a palm on
                // the glass) from taking over the gesture the player actually started.
                handler(point.x, point.y, pointer.id);
            };
            scene.input.on(event, listener);
            return () => scene.input.off(event, listener);
        });
        return () => {
            for (const dispose of disposers) dispose();
        };
    };

    return {
        onDown: (handler) =>
            subscribe(['pointerdown', 'pointerdownoutside'] as const, handler),
        onMove: (handler) => subscribe(['pointermove'] as const, handler),
        onUp: (handler) => subscribe(['pointerup', 'pointerupoutside'] as const, handler),
    };
}
