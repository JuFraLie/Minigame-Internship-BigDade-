/**
 * Game — the round scene. Drives the domain loop and forwards snapshots to the
 * renderer; contains no game logic of its own (AGENTS.md §4.3).
 *
 * HUD: live score, ball count, wave, and a Pause button. The pause overlay offers
 * Resume only — no restart, no exit (AGENTS.md §2).
 *
 * All layout is in design units (CSS pixels of the window) — the camera zoom
 * handles the backing-store density, so the canvas is sharp on a phone and the
 * maths stays readable. A window resize (URL bar collapsing, split screen) is
 * adopted live: the world keeps its aspect and the HUD re-positions.
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { GameSession } from '../domain/GameSession.ts';
import { PhaserRenderer } from '../adapters/phaser/PhaserRenderer.ts';
import { PhaserInput } from '../adapters/phaser/PhaserInput.ts';
import {
    applyRenderScale, hudTop, measureViewport, VIEWPORT_CHANGED, type Viewport,
} from '../adapters/phaser/viewport.ts';
import type { DomainEvent } from '../domain/types.ts';

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
    private paddleInput!: PhaserInput;
    private paused = false;
    private overlay!: Phaser.GameObjects.Container;
    private unsubscribe: (() => void) | null = null;
    /** Guards against double-firing endRound / scene switch. */
    private ended = false;
    private viewport!: Viewport;
    /** World height in world units, recomputed from the viewport aspect. */
    private worldHeight = 200;
    /** Scene-owned UI (background, pause button) — rebuilt on viewport change.
     *  The renderer's sprites live in the same display list and must survive. */
    private ownUi: Phaser.GameObjects.GameObject[] = [];

    create(): void {
        this.viewport = measureViewport();
        applyRenderScale(this);
        const { width: w, height: h } = this.viewport;

        const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);
        this.ownUi = [bg];

        // A fresh session per round; the DDA is shared via the context so it
        // keeps what it learned across Retries in this session (nothing is stored).
        this.session = new GameSession(this.ctx.random, this.ctx.clock, this.ctx.bus, this.ctx.dda);
        this.worldRenderer = new PhaserRenderer(this);
        this.worldRenderer.create(this.viewport);
        this.ended = false;
        this.paused = false;

        // World height in world units: 100 wide, height follows the aspect ratio.
        this.worldHeight = 100 * (h / w);
        this.session.start(this.worldHeight);

        // Domain events → renderer FX and the bridge.
        this.unsubscribe = this.ctx.bus.subscribe((e) => this.onDomainEvent(e));

        // Touch input: relative horizontal drag, anywhere on screen. Pointer
        // coordinates are in backing-store pixels, so the conversion divides
        // by the design width times the density.
        let paddleTargetX = 50; // world centre
        const unitsPerPixel = (): number => 100 / (this.viewport.width * this.worldRenderer.densityScale);
        this.paddleInput = new PhaserInput(this, unitsPerPixel, (dx) => {
            paddleTargetX = Math.max(0, Math.min(100, paddleTargetX + dx));
            this.session.setPaddleTargetX(paddleTargetX);
        });
        this.paddleInput.setEnabled(true);

        this.buildPauseButton();
        this.buildPauseOverlay();

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
        this.worldRenderer.render(this.session.snapshot());
    }

    // ---- domain events ----

    private onDomainEvent(e: DomainEvent): void {
        switch (e.type) {
            case 'brickHit':
                if (e.destroyed) {
                    this.worldRenderer.burst(e.x, e.y, 0xffffff);
                }
                break;
            case 'ballLost':
                // With a full volley the shakes would chain into constant noise;
                // save the feedback for the moment it actually matters — the
                // last ball (one more miss = game over).
                if (e.ballsLeft <= 1) this.worldRenderer.triggerShake();
                break;
            case 'roundEnded':
                this.finishRound(e.win, e.score);
                break;
            default:
                break;
        }
    }

    private finishRound(win: boolean, score: number): void {
        if (this.ended) return;
        this.ended = true;
        this.paddleInput.setEnabled(false);
        // The Result Panel appears → endRound, then hand over to GameOver.
        this.ctx.bridge.signalEndRound(win, score);
        this.ctx.lastWin = win;
        this.ctx.lastScore = score;
        this.scene.start('GameOver', { ctx: this.ctx, win, score });
    }

    // ---- pause (resume only) ----

    private buildPauseButton(): void {
        const { width: w } = this.viewport;
        // Just under the HUD band, clear of any cutout.
        const y = hudTop(this.viewport, Math.round(w * 0.045)) + w * 0.055;
        const size = w * 0.09;
        const btn = this.add.rectangle(w * 0.92, y, size, size, 0x1c2540)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(w * 0.92, y, 'II', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.04)}px`,
            color: '#ffffff',
        }).setOrigin(0.5);
        btn.on('pointerdown', () => this.setPaused(true));
        this.ownUi.push(btn, label);
    }

    private buildPauseOverlay(): void {
        const { width: w, height: h } = this.viewport;
        this.overlay = this.add.container(0, 0).setVisible(false);

        const dim = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6);
        const label = this.add.text(w / 2, h * 0.4, 'PAUSED', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.09)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Resume only — no restart, no exit.
        const btnW = w * 0.5;
        const btnH = h * 0.07;
        const resume = this.add.rectangle(w / 2, h * 0.55, btnW, btnH, 0x36a2eb)
            .setInteractive({ useHandCursor: true });
        const resumeLabel = this.add.text(w / 2, h * 0.55, 'RESUME', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);

        resume.on('pointerdown', () => this.setPaused(false));
        this.overlay.add([dim, label, resume, resumeLabel]);
    }

    private setPaused(paused: boolean): void {
        if (this.ended) return;
        this.paused = paused;
        this.overlay.setVisible(paused);
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

        // Destroy only what this scene owns; the renderer's pooled sprites stay.
        for (const obj of this.ownUi) obj.destroy();
        this.ownUi = [];
        this.overlay.destroy();

        const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);
        // Re-added after the renderer's sprites, so push it behind them again.
        bg.setDepth(-10);
        this.ownUi.push(bg);
        this.buildPauseButton();
        this.buildPauseOverlay();
        this.overlay.setVisible(this.paused);
    }
}
