import Phaser from 'phaser';
import type { RoundResult } from '../../app/roundSession.ts';
import { ResultPanel } from '../../render/resultPanelView.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../../render/viewport.ts';
import { fadeIn, fadeOutAndStart } from '../../render/transition.ts';
import { advanceLevel, bridgePort, sessionState } from '../wiring.ts';

/**
 * The Result Panel (AGENTS.md §2).
 *
 * `endRound` has already been reported by the round before this scene appears, so the
 * score is final here. This is the only screen that offers Next Level, Retry or Exit, and
 * Exit does nothing but emit the bridge signal once — no navigation, no restart.
 */
export class GameOver extends Phaser.Scene {
    private result: RoundResult = { win: true, score: 0, cleared: 0, totalCars: 0, maxCombo: 0, level: 1 };
    private leaving = false;
    private panel: ResultPanel | null = null;

    constructor() {
        super('GameOver');
    }

    /** Receives the finalised score from the gameplay scene. */
    init(data: RoundResult): void {
        if (data) this.result = data;
    }

    create(): void {
        applyRenderScale(this);
        this.leaving = false;

        this.panel = new ResultPanel(this, this.result, {
            onNextLevel: () => this.nextLevel(),
            onRetry: () => this.retry(),
            onExit: () => this.exit(),
        });

        this.game.events.on(VIEWPORT_CHANGED, this.relayout, this);
        this.events.once('shutdown', () => {
            this.game.events.off(VIEWPORT_CHANGED, this.relayout, this);
            this.panel?.dispose();
            this.panel = null;
        });

        fadeIn(this);
    }

    private relayout(): void {
        if (this.leaving) return;
        applyRenderScale(this);
        // The panel lays itself out from the viewport, so a WebView that settles late
        // (rotation, split screen, DevTools) gets a redrawn panel rather than one
        // stranded at the old size.
        this.panel?.rebuild();
    }

    /** Next Level: the session moves on and the round starts again at the new level. */
    private nextLevel(): void {
        if (this.leaving) return;
        this.leaving = true;
        advanceLevel();
        fadeOutAndStart(this, 'Game');
    }

    /** Retry goes straight back to gameplay — the Play Screen never replays. */
    private retry(): void {
        if (this.leaving) return;
        this.leaving = true;
        // The level is deliberately NOT advanced: a retry replays the level just lost.
        sessionState.level = this.result.level;
        fadeOutAndStart(this, 'Game');
    }

    /** Exit reports the session to the host and does nothing else. Guarded to once. */
    private exit(): void {
        bridgePort.exit(this.result.win, this.result.score);
    }
}
