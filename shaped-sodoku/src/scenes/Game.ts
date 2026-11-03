import Phaser from 'phaser';

import type { AppDeps } from '../app/deps.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../app/viewport.ts';
import type { GameCommand, RoundEvent, EventsOutPort } from '../domain/ports.ts';
import { RoundState } from '../domain/RoundState.ts';
import type { InputPort } from '../input/InputAdapter.ts';
import { computeLayout, type GameLayout } from '../render/GameLayout.ts';
import type { RenderPort } from '../render/RenderPort.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';

/** Lets the last placement animation play out before the Result Panel replaces it. */
const RESULT_DELAY_MS = 750;
/**
 * How often the HUD refreshes itself between taps.
 *
 * The clock lives in the snapshot, and a snapshot is only pushed when the player acts —
 * without this the countdown would freeze on whatever it last said until the next move.
 */
const HUD_TICK_MS = 500;

/**
 * The gameplay screen: HUD, board and shape tray.
 *
 * This scene holds only the round, a renderer and an input adapter — all through their
 * ports — and nothing else. A tap becomes a command, the command becomes events, the
 * snapshot is pushed to the renderer first and the events are then played as flourishes.
 * That ordering matters: sync-first means an animation is never half-overwritten by a
 * redraw it did not ask for.
 */
export class Game extends Phaser.Scene {
    readonly #deps: AppDeps;

    #round: RoundState | null = null;
    #renderer: RenderPort | null = null;
    #input: InputPort | null = null;
    #layout: GameLayout | null = null;
    /** Events queued by the round during one command, drained before the next. */
    #pending: RoundEvent[] = [];
    #ended = false;

    readonly #onViewportChanged = (): void => this.#relayout();

    constructor(deps: AppDeps) {
        super({ key: SCENE_GAME });
        this.#deps = deps;
    }

    create(): void {
        applyRenderScale(this);

        this.#pending = [];
        this.#ended = false;

        const session = this.#deps.session;
        const events: EventsOutPort = { emit: (event) => this.#pending.push(event) };

        this.#round = RoundState.create(session.level, session.puzzleSeed, this.#deps.clock, events);
        this.#layout = this.#buildLayout(this.#round.board.size);

        this.#renderer = this.#deps.createRenderer(this);
        this.#renderer.create(this.#layout, this.#round.board.size);
        this.#input = this.#deps.createInput(() => this.#layout);

        this.#renderer.sync(this.#round.snapshot());
        this.#deps.bridge.startRound();

        // Phaser's Clock is torn down with the scene, so this loop needs no cleanup of its own.
        this.time.addEvent({ delay: HUD_TICK_MS, loop: true, callback: () => this.#tick() });

        this.input.on('pointerdown', this.#onPointerDown, this);
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#teardown, this);
    }

    /** Re-pushes the snapshot so the HUD clock keeps counting between taps. */
    #tick(): void {
        const round = this.#round;
        if (!round || this.#ended) return;
        this.#renderer?.sync(round.snapshot());
    }

    // ---- input -------------------------------------------------------------

    #onPointerDown(pointer: Phaser.Input.Pointer): void {
        const round = this.#round;
        const input = this.#input;
        if (!round || !input || this.#ended) return;

        const command: GameCommand | null = input.pick(pointer.worldX, pointer.worldY);
        if (!command) return;

        round.handle(command);

        // State first…
        this.#renderer?.sync(round.snapshot());
        // …then the flourishes the state just earned.
        const pending = this.#pending;
        this.#pending = [];
        for (const event of pending) this.#apply(event);
    }

    #apply(event: RoundEvent): void {
        switch (event.type) {
            case 'correct':
                this.#renderer?.celebratePlacement(event.index, event.shape);
                break;
            case 'wrong':
                this.#renderer?.celebrateMistake(event.index, event.shape);
                this.#renderer?.pulseDanger();
                break;
            case 'linesCompleted':
                this.#renderer?.celebrateLines(event.lines);
                break;
            case 'won':
                this.#endRound(true, event.score);
                break;
            case 'lost':
                this.#endRound(false, event.score);
                break;
            // 'selected' and 'timeBonus' are already visible in the redraw that followed.
            default:
                break;
        }
    }

    /** Reports the score, then hands over to the Result Panel. */
    #endRound(win: boolean, score: number): void {
        if (this.#ended) return;
        this.#ended = true;

        this.time.delayedCall(RESULT_DELAY_MS, () => {
            this.#deps.session.recordResult(win, score);
            this.#deps.bridge.endRound(win, score);
            this.scene.start(SCENE_RESULT);
        });
    }

    // ---- layout ------------------------------------------------------------

    #buildLayout(grid: { size: number }): GameLayout {
        const viewport = this.#deps.viewport.current();
        return computeLayout({
            width: viewport.width,
            height: viewport.height,
            safeTop: viewport.safeTop,
            safeBottom: viewport.safeBottom,
            gridSize: grid.size,
            shapeCount: grid.size,
        });
    }

    #relayout(): void {
        const round = this.#round;
        if (!round) return;
        this.#layout = this.#buildLayout(round.board.size);
        this.#renderer?.relayout(this.#layout);
    }

    // ---- teardown ----------------------------------------------------------

    #teardown(): void {
        this.input.off('pointerdown', this.#onPointerDown, this);
        this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.#renderer?.destroy();
        this.#renderer = null;
        this.#input = null;
        this.#layout = null;
        this.#round = null;
        this.#pending = [];
    }
}
