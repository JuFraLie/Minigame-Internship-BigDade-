import Phaser from 'phaser';
import type { RoundResult } from '../../app/roundSession.ts';
import { audioPort, bridgePort } from '../wiring.ts';
import { ResultPanel } from '../../rendering/resultPanelView.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../../rendering/viewport.ts';

/**
 * The Result Panel (AGENTS.md §2).
 *
 * `endRound` has already been reported by the round before this scene appears, so the score
 * is final here. This is the only screen in the game that offers Restart or Exit, and Exit
 * does nothing but emit the bridge signal — no navigation, no restart.
 *
 * The panel itself is drawn by `ResultPanel`; this scene only owns the flow around it.
 */
export class GameOver extends Phaser.Scene {
    private result: RoundResult = { score: 0, defeated: 0, maxCombo: 0, win: true };
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
            onRetry: () => this.retry(),
            onExit: () => this.exit(),
        });

        this.game.events.on(VIEWPORT_CHANGED, this.relayout, this);
        this.events.once('shutdown', () =>
            this.game.events.off(VIEWPORT_CHANGED, this.relayout, this),
        );
    }

    /**
     * The Result Panel holds its final score in `result`, so a resize just redraws the panel
     * — what the player earned survives it.
     */
    private relayout(): void {
        if (this.leaving) return;
        this.panel?.rebuild();
    }

    /** Retry goes straight back to gameplay — the Play Screen never replays. */
    private retry(): void {
        if (this.leaving) return;
        this.leaving = true;
        audioPort.uiTap();
        this.scene.start('Game');
    }

    /** Exit reports the session to the host and does nothing else. Guarded to once. */
    private exit(): void {
        bridgePort.exit(this.result.win, this.result.score);
    }
}
