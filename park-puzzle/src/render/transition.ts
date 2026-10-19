import Phaser from 'phaser';

/**
 * Scene-to-scene fades.
 *
 * Every screen change in this game used to be a hard cut, which on a touch device reads
 * as a dropped frame rather than as a change of screen. Each transition is therefore two
 * halves: the outgoing scene fades to black and only then hands over, and the incoming
 * scene fades back up from it, so the change reads as one continuous dimming.
 *
 * The fade is driven by `Camera.fadeEffect`, which the camera advances from its own update
 * and draws over the finished frame in `postRenderCanvas`. It is not a tween, so there is
 * nothing to unwind when a scene shuts down.
 */

/** One half of a transition. Both halves together stay well under half a second. */
export const FADE_MS = 170;

/**
 * Fades this scene to black, then switches to `key`.
 *
 * The switch happens on `FADE_OUT_COMPLETE`, never immediately: the outgoing scene stays
 * on screen for the whole ramp, so its last frame is what dims away instead of vanishing
 * under the finger.
 *
 * `Camera.fadeOut` force-restarts the effect, which is what makes a press during the entry
 * fade-in safe — it is re-run as a fade-out rather than ignored. Ignoring it would leave
 * the listener above waiting for an event that never comes, and the button that was just
 * pressed would appear to do nothing forever. Every caller is already guarded against a
 * second call (`starting`, `leaving`, `ending`), so there is never more than one listener.
 */
export function fadeOutAndStart(scene: Phaser.Scene, key: string, data?: object): void {
    const camera = scene.cameras.main;

    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        scene.scene.start(key, data);
    });
    camera.fadeOut(FADE_MS, 0, 0, 0);
}

/**
 * Fades a freshly entered scene up from black. Call once at the end of `create()`.
 *
 * This is also the reason every scene calls it: a camera remembers the black it faded out
 * to, so without an explicit fade back the second visit to a screen would start solid
 * black and stay that way.
 */
export function fadeIn(scene: Phaser.Scene): void {
    scene.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
}
