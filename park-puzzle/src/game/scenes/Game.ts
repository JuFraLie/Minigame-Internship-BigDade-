import Phaser from 'phaser';
import type { RoundResult } from '../../app/roundSession.ts';
import { attachTapInput } from '../../input/tapInput.ts';
import { phaserTapSource } from '../../input/phaserTapSource.ts';
import { GameView } from '../../render/gameView.ts';
import { PauseOverlay } from '../../render/pauseOverlay.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../../render/viewport.ts';
import { createRoundSession } from '../wiring.ts';

/**
 * The gameplay scene.
 *
 * It owns the round, the frame loop and the wiring — nothing else. The pixels belong to
 * `GameView`, the taps to `attachTapInput`, which is the only place a screen point becomes
 * a lot cell: neither the session nor the world ever sees a screen position
 * (AGENTS.md §4.3).
 *
 * A frame is clamped before it reaches the session, so a backgrounded WebView cannot
 * tunnel cars through the ring while the player is away.
 */
export class Game extends Phaser.Scene {
    private session = createRoundSession();
    private view: GameView | null = null;
    private detachInput: (() => void) | null = null;
    private pause: PauseOverlay | null = null;
    private paused = false;
    private ending = false;
    /**
     * Round time until which taps are ignored.
     *
     * Pressing RESUME releases both the overlay's button and this scene's tap listener for
     * the same press, and the button sits over the middle of the board — without this
     * guard, resuming would also fling whatever car is underneath back onto the ring.
     */
    private ignoreTapsUntil = 0;

    constructor() {
        super('Game');
    }

    create(): void {
        applyRenderScale(this);
        this.paused = false;
        this.ending = false;
        this.ignoreTapsUntil = 0;

        this.view = new GameView(this, this.session.world.cols, this.session.world.rows, () =>
            this.setPaused(true),
        );

        this.detachInput = attachTapInput(
            phaserTapSource(this),
            () => this.view!.boardLayout,
            // Taps are dropped while paused and for a beat after resuming: the overlay is
            // what the player is looking at, and Phaser's scene-level `pointerdown` fires
            // no matter which object sits under the finger, so the guard has to live here
            // rather than in the overlay.
            {
                tapCell: (col, row) => {
                    if (this.paused || this.time.now < this.ignoreTapsUntil) return;
                    this.session.tapCell(col, row);
                },
            },
        );

        // A round starts on entry: every round, including Retry and Next Level.
        this.session.startRound();

        this.game.events.on(VIEWPORT_CHANGED, this.relayout, this);
        this.events.once('shutdown', () => this.teardown());
    }

    /** A resize keeps the round running: only the drawing layer is laid out again. */
    private relayout(): void {
        if (this.ending) return;
        applyRenderScale(this);
        this.view?.relayout();
    }

    /** Pause is only ever a resume (AGENTS.md §2). */
    private setPaused(paused: boolean): void {
        if (this.ending || this.paused === paused) return;
        this.paused = paused;

        if (paused) {
            this.pause = new PauseOverlay(this, () => this.setPaused(false));
            return;
        }

        this.pause?.dispose();
        this.pause = null;
        this.ignoreTapsUntil = this.time.now + 250;
    }

    update(_time: number, deltaMs: number): void {
        const { session, view } = this;
        if (!session || !view || this.ending || this.paused) return;

        session.update(Math.min(deltaMs, 50) / 1000);
        view.draw(session.world.snapshot(), session.level);

        if (session.roundOver) this.endRound();
    }

    /** Finalises the score, which reports `endRound` once, and shows the Result Panel. */
    private endRound(): void {
        const session = this.session;
        if (!session || this.ending) return;

        const result: RoundResult | null = session.finishRound();
        if (!result) return;

        this.ending = true;
        this.scene.start('GameOver', result);
    }

    /** Releases the round's listeners and drawing layer when the scene shuts down. */
    private teardown(): void {
        this.game.events.off(VIEWPORT_CHANGED, this.relayout, this);
        this.detachInput?.();
        this.detachInput = null;
        this.pause?.dispose();
        this.pause = null;
        this.view?.dispose();
        this.view = null;
    }
}
