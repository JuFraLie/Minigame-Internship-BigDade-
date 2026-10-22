/**
 * Game — the round scene. Drives the domain loop and forwards snapshots to the
 * renderer; contains no game logic of its own (AGENTS.md §4.3).
 *
 * HUD: live score, lives, wave, and a Pause button. The pause overlay offers
 * Resume only — no restart, no exit (AGENTS.md §2).
 */

import Phaser from 'phaser';
import type { AppContext } from '../app/AppContext.ts';
import { GameSession } from '../domain/GameSession.ts';
import { PhaserRenderer } from '../adapters/phaser/PhaserRenderer.ts';
import { PhaserInput } from '../adapters/phaser/PhaserInput.ts';
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

    create(): void {
        const w = this.scale.width;
        const h = this.scale.height;

        this.add.rectangle(w / 2, h / 2, w, h, 0x0b1020);

        // A fresh session per round; the DDA is shared via the context so it
        // keeps what it learned across Retries in this session (nothing is stored).
        this.session = new GameSession(this.ctx.random, this.ctx.clock, this.ctx.bus, this.ctx.dda);
        this.worldRenderer = new PhaserRenderer(this);
        this.worldRenderer.create(w, h);
        this.ended = false;

        // World height in world units: 100 wide, height follows the aspect ratio.
        this.session.start(100 * (h / w));

        // Domain events → renderer FX and the bridge.
        this.unsubscribe = this.ctx.bus.subscribe((e) => this.onDomainEvent(e));

        // Touch input: relative horizontal drag, anywhere on screen.
        let paddleTargetX = 50; // world centre
        const unitsPerPixel = (): number => 100 / this.scale.width;
        this.paddleInput = new PhaserInput(this, unitsPerPixel, (dx) => {
            paddleTargetX = Math.max(0, Math.min(100, paddleTargetX + dx));
            this.session.setPaddleTargetX(paddleTargetX);
        });
        this.paddleInput.setEnabled(true);

        this.buildPauseButton();
        this.buildPauseOverlay();

        // Every round start, including Retry, reports startRound (AGENTS.md §4.2).
        this.ctx.bridge.signalStartRound();

        this.scale.on('resize', this.onResize, this);
        this.events.once('shutdown', () => {
            this.unsubscribe?.();
            this.unsubscribe = null;
            // The input plugin outlives a scene restart — detach our handlers.
            this.paddleInput.destroy();
            this.scale.off('resize', this.onResize, this);
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
            case 'lifeLost':
                this.worldRenderer.triggerShake();
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
        const w = this.scale.width;
        const h = this.scale.height;
        const size = w * 0.09;
        const btn = this.add.rectangle(w * 0.92, h * 0.135, size, size, 0x1c2540)
            .setInteractive({ useHandCursor: true });
        this.add.text(w * 0.92, h * 0.135, 'II', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${Math.round(w * 0.04)}px`,
            color: '#ffffff',
        }).setOrigin(0.5);
        btn.on('pointerdown', () => this.setPaused(true));
    }

    private buildPauseOverlay(): void {
        const w = this.scale.width;
        const h = this.scale.height;
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

    private onResize(): void {
        // Portrait, any height: re-derive the world→screen scale. Layout of the
        // fixed HUD elements is rebuilt on the next scene create; during a round
        // only the scale changes, which the renderer picks up per frame.
        this.worldRenderer.resize(this.scale.width, this.scale.height);
    }
}
