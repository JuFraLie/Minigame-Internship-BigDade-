import type Phaser from 'phaser';

import { renderScale } from '../../app/viewport.ts';

/**
 * Points a scene's camera at design space.
 *
 * The canvas backing store is design size x `renderScale()`, so the camera zooms by the
 * same factor. Every scene can then lay itself out purely in design units and still be
 * rendered crisply on a high-density screen.
 */
export function applyRenderScale(scene: Phaser.Scene): void {
    scene.cameras.main.setOrigin(0, 0);
    scene.cameras.main.setZoom(renderScale());
}
