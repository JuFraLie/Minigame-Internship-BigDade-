/**
 * Screen-space → world-space input.
 *
 * One touch scheme only: a relative horizontal drag moves the paddle. The
 * finger can be anywhere on screen; only its horizontal movement matters, so
 * it never has to cover the ball or paddle.
 */

import type Phaser from 'phaser';

/** Converts screen pixels to world units (world is always 100 wide). */
export type UnitsPerPixel = () => number;

export class PhaserInput {
    private lastPointerX: number | null = null;
    private enabled = false;
    private readonly onDrag: (deltaWorldX: number) => void;
    private readonly scene: Phaser.Scene;
    private readonly unitsPerPixel: UnitsPerPixel;

    constructor(scene: Phaser.Scene, unitsPerPixel: UnitsPerPixel, onDrag: (deltaWorldX: number) => void) {
        this.scene = scene;
        this.unitsPerPixel = unitsPerPixel;
        this.onDrag = onDrag;

        scene.input.on('pointerdown', this.handleDown, this);
        scene.input.on('pointermove', this.handleMove, this);
        // A cancelled touch (system gesture, incoming call) must not leave the
        // paddle stuck: drop the drag so the next pointerdown re-anchors.
        scene.input.on('pointerup', this.handleUp, this);
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.lastPointerX = null;
    }

    /** Detach the listeners — the Game scene is restarted on every Retry, and
     *  the scene's input plugin outlives a restart. */
    destroy(): void {
        this.scene.input.off('pointerdown', this.handleDown, this);
        this.scene.input.off('pointermove', this.handleMove, this);
        this.scene.input.off('pointerup', this.handleUp, this);
    }

    private handleDown(p: Phaser.Input.Pointer): void {
        if (!this.enabled) return;
        this.lastPointerX = p.x;
    }

    private handleMove(p: Phaser.Input.Pointer): void {
        if (!this.enabled || this.lastPointerX === null || !p.isDown) return;
        const deltaPx = p.x - this.lastPointerX;
        this.lastPointerX = p.x;
        this.onDrag(deltaPx * this.unitsPerPixel());
    }

    private handleUp(): void {
        this.lastPointerX = null;
    }
}
