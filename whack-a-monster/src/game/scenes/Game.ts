import Phaser from 'phaser';
import { attachPointerInput } from '../../input/pointerInput.ts';
import type { PointerInput } from '../../input/pointerInput.ts';
import { phaserPointerSource } from '../../input/phaserPointerSource.ts';
import { GameView } from '../../rendering/gameView.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../../rendering/viewport.ts';
import type { RoundResult } from '../../app/roundSession.ts';
import type { RoundSession } from '../../app/roundSession.ts';
import { createRoundSession } from '../wiring.ts';

/**
 * The gameplay scene.
 *
 * It owns the round, the frame loop and the wiring — nothing else. The pixels belong to
 * `GameView` (world, HUD, effects and the decoration its events trigger), the gestures to
 * `attachPointerInput`, which is the only place pointers become field coordinates: neither
 * the session nor the world ever sees a screen position (AGENTS.md §4.3).
 */
export class Game extends Phaser.Scene {
    private session: RoundSession | null = null;
    private view: GameView | null = null;
    private pointerInput: PointerInput | null = null;
    private ending = false;

    constructor() {
        super('Game');
    }

    create(): void {
        this.ending = false;
        const session = createRoundSession();
        this.session = session;

        this.buildRendering();
        session.startRound();

        this.events.once('shutdown', () => this.teardown());
        // A resize is handled by `relayout`, which rebuilds only the drawing layer.
        this.game.events.on(VIEWPORT_CHANGED, this.relayout, this);
    }

    /**
     * Builds the drawing layer and the input wiring for the current screen size. Split from
     * `create` so a viewport change can lay it out again around the round in progress.
     */
    private buildRendering(): void {
        const session = this.session;
        if (!session) return;

        applyRenderScale(this);
        this.view = new GameView(this, session.world, () => this.time.now);
        this.attachPointerInput(session);
    }

    private attachPointerInput(session: RoundSession): void {
        const view = this.view;
        if (!view) return;

        this.pointerInput = attachPointerInput({
            source: phaserPointerSource(this),
            round: session,
            layout: view.layout,
            fx: view.fxPort,
        });
    }

    private detachPointerInput(): void {
        this.pointerInput?.dispose();
        this.pointerInput = null;
    }

    /**
     * A resize keeps the round running: only the drawing layer and the input wiring built
     * from it are laid out again — the score and the monsters are never reset (a mid-round
     * restart would not be allowed).
     */
    private relayout(): void {
        const session = this.session;
        if (!session || this.ending) return;

        applyRenderScale(this);
        this.detachPointerInput();
        this.view?.relayout();
        this.attachPointerInput(session);
    }

    /** Drops the drawing layer and the input wiring without touching the round. */
    private disposeRendering(): void {
        this.detachPointerInput();
        this.view?.dispose();
        this.view = null;
    }

    update(_time: number, deltaMs: number): void {
        const { session, view } = this;
        if (!session || !view || this.ending) return;

        // A frame is clamped so a backgrounded tab cannot tunnel monsters through their
        // timers when the game comes back.
        session.update(Math.min(deltaMs, 50) / 1000);
        view.update();

        if (session.roundOver) this.endRound();
    }

    /** Finalises the score (which reports `endRound` once) and shows the Result Panel. */
    private endRound(): void {
        const session = this.session;
        if (!session || this.ending) return;

        const result: RoundResult | null = session.finishRound();
        if (!result) return;

        this.ending = true;
        this.scene.start('GameOver', result);
    }

    /** Releases the round's listeners when the scene shuts down or restarts. */
    private teardown(): void {
        this.game.events.off(VIEWPORT_CHANGED, this.relayout, this);
        this.disposeRendering();
        this.session = null;
    }
}
