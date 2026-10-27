/**
 * Game — the round scene. Wires the domain loop to the view pieces and holds
 * no game logic of its own (AGENTS.md §4.3). Each concern lives elsewhere:
 *
 *   - GameSession (domain) — the simulation, advanced once per frame.
 *   - PhaserRenderer (adapter) — draws the world: paddle, balls, bricks, drops.
 *   - Hud (adapter) — draws the score/wave/ball readouts and banners.
 *   - PauseMenu (adapter) — the pause button and the resume overlay.
 *   - PhaserInput (adapter) — relative drag → paddle target X.
 *
 * All layout is in design units (CSS pixels of the portrait playfield) — the
 * camera zoom handles the backing-store density, so the canvas is sharp on a
 * phone and the maths stays readable. A window resize (URL bar collapsing,
 * split screen) is adopted live: the world keeps its aspect and the UI
 * re-positions.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { GameSession } from '../domain/GameSession.ts';
import { PhaserRenderer } from '../adapters/phaser/PhaserRenderer.ts';
import { PhaserInput } from '../adapters/phaser/PhaserInput.ts';
import { Hud } from '../adapters/phaser/Hud.ts';
import { PauseMenu } from '../adapters/phaser/PauseMenu.ts';
import {
    applyRenderScale, measureViewport, VIEWPORT_CHANGED, type Viewport,
} from '../adapters/phaser/viewport.ts';
import { backdrop } from '../adapters/phaser/ui.ts';
import type { DomainEvent, WorldSnapshot } from '../domain/types.ts';

export class Game extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    init(data: { ctx: AppContext }): void {
        this.ctx = data.ctx;
    }

    private ctx!: AppContext;
    private session!: GameSession;
    private worldRenderer!: PhaserRenderer;
    private hud!: Hud;
    private pauseMenu!: PauseMenu;
    private paddleInput!: PhaserInput;
    private paused = false;
    private unsubscribe: (() => void) | null = null;
    /** Guards against double-firing endRound / scene switch. */
    private ended = false;
    private viewport!: Viewport;
    /** World height in world units, recomputed from the viewport aspect. */
    private worldHeight = 200;
    /** Scene-owned background — repositioned on viewport change. */
    private background!: Phaser.GameObjects.Image;

    create(): void {
        this.viewport = measureViewport();
        applyRenderScale(this);
        const { width: w, height: h } = this.viewport;

        this.background = backdrop(this, w, h);
        this.background.setDepth(-10);

        // A fresh session per round; the DDA is shared via the context so it
        // keeps what it learned across Retries in this session (nothing is stored).
        this.session = new GameSession(this.ctx.random, this.ctx.clock, this.ctx.bus, this.ctx.dda);

        this.worldRenderer = new PhaserRenderer(this);
        this.worldRenderer.create(this.viewport);
        this.hud = new Hud(this);
        this.hud.create(this.viewport);

        this.ended = false;
        this.paused = false;

        // World height in world units: 100 wide, height follows the aspect ratio.
        this.worldHeight = 100 * (h / w);
        this.session.start(this.worldHeight);

        // Domain events → renderer FX and the bridge.
        this.unsubscribe = this.ctx.bus.subscribe((e) => this.onDomainEvent(e));

        this.paddleInput = this.createPaddleInput();
        this.paddleInput.setEnabled(true);

        this.pauseMenu = new PauseMenu(this, {
            onPause: () => this.setPaused(true),
            onResume: () => this.setPaused(false),
        });
        this.pauseMenu.build(this.viewport);

        // Every round start, including Retry, reports startRound (AGENTS.md §4.2).
        this.ctx.bridge.signalStartRound();

        this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this);
        this.events.once('shutdown', () => {
            this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this);
            this.unsubscribe?.();
            this.unsubscribe = null;
            // The input plugin outlives a scene restart — detach our handlers.
            this.paddleInput.destroy();
        });
    }

    update(_time: number, deltaMs: number): void {
        if (this.paused || this.ended) return;
        this.session.update(deltaMs / 1000);
        this.render(this.session.snapshot());
    }

    // ---- input ----

    /**
     * Touch input: a relative horizontal drag moves the paddle, anywhere on
     * screen. Pointer coordinates are in backing-store pixels, so the
     * conversion divides by the design width times the density.
     */
    private createPaddleInput(): PhaserInput {
        let paddleTargetX = 50; // world centre
        const unitsPerPixel = (): number => 100 / (this.viewport.width * this.worldRenderer.densityScale);
        return new PhaserInput(this, unitsPerPixel, (dx) => {
            paddleTargetX = Math.max(0, Math.min(100, paddleTargetX + dx));
            this.session.setPaddleTargetX(paddleTargetX);
        });
    }

    // ---- frame ----

    /** Forward the snapshot to the two view pieces: world first, HUD on top. */
    private render(snap: WorldSnapshot): void {
        this.worldRenderer.render(snap);
        this.hud.render(snap);
    }

    // ---- domain events ----

    private onDomainEvent(e: DomainEvent): void {
        switch (e.type) {
            case 'brickHit':
                if (e.destroyed) {
                    this.worldRenderer.burstBrick(e.x, e.y, e.kind);
                }
                break;
            case 'ballLost':
                // With a full volley the shakes would chain into constant noise;
                // save the feedback for the moment it actually matters — the
                // last ball (one more miss = game over).
                if (e.ballsLeft <= 1) this.worldRenderer.triggerShake();
                break;
            case 'roundEnded':
                this.finishRound(e.wave, e.score);
                break;
            default:
                break;
        }
    }

    private finishRound(wave: number, score: number): void {
        if (this.ended) return;
        this.ended = true;
        this.paddleInput.setEnabled(false);
        // The run is endless, so the host contract wants `win: true` on the
        // endRound signal (jsbridge.ts §endRound). Then hand over to GameOver.
        this.ctx.bridge.signalEndRound(true, score);
        this.ctx.lastWave = wave;
        this.ctx.lastScore = score;
        this.scene.start('GameOver', { ctx: this.ctx, wave, score });
    }

    // ---- pause (resume only) ----

    private setPaused(paused: boolean): void {
        if (this.ended) return;
        this.paused = paused;
        this.pauseMenu.setVisible(paused);
        this.paddleInput.setEnabled(!paused);
    }

    // ---- window changes ----

    /**
     * The canvas adopted a new size. Re-derive the world aspect, reposition the
     * HUD and overlays, and keep the round running — a phone's URL bar
     * collapsing must never restart or break play.
     */
    private onViewportChanged(): void {
        this.viewport = measureViewport();
        const { width: w, height: h } = this.viewport;
        this.worldHeight = 100 * (h / w);
        this.session.resize(this.worldHeight);

        this.worldRenderer.layout(this.viewport);
        this.hud.layout(this.viewport);
        this.background.setPosition(w / 2, h / 2).setDisplaySize(w, h);
        this.pauseMenu.build(this.viewport);
        this.pauseMenu.setVisible(this.paused);
    }
}
