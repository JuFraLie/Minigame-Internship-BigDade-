import Phaser from 'phaser';

import type { AppDeps } from '../../../app/deps.ts';
import { VIEWPORT_CHANGED } from '../../../app/viewport.ts';
import { Simulation } from '../../../domain/simulation.ts';
import type { RoundEvent } from '../../../domain/types.ts';
import { preloadSprites } from '../assets.ts';
import type { InputPort, PlayAction, PlayContext, Selection } from '../inputAdapter.ts';
import { computePlayLayout, type PlayLayout } from '../layout.ts';
import type { GameViewPort } from '../playView.ts';
import { applyRenderScale } from '../scale.ts';
import { createViewTransform, type ViewTransform } from '../viewTransform.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';

/** Let the last flourish play out before the Result Panel replaces it. */
const RESULT_DELAY_MS = 500;

/** Fixed simulation rate; a slow frame runs more steps, never a bigger one. */
const STEP_MS = 1000 / 30;
/** Cap on accumulated time, so a backgrounded tab cannot trigger a step spiral. */
const MAX_CATCHUP_MS = 250;

/**
 * The gameplay screen: HUD, board, menus and the pause overlay.
 *
 * The scene holds only the round, a renderer and an input adapter — all through their
 * ports. A tap becomes an action, the action becomes a command, and every frame the
 * simulation is stepped at a fixed 30 Hz and the snapshot is pushed to the renderer with
 * an interpolation alpha. The scene never contains game rules.
 */
export class Game extends Phaser.Scene {
    readonly #deps: AppDeps;

    #sim: Simulation | null = null;
    #view: GameViewPort | null = null;
    #input: InputPort | null = null;
    #layout: PlayLayout | null = null;
    #transform: ViewTransform | null = null;
    #selection: Selection | null = null;
    /** Events queued by the round, drained before each render. */
    #pending: RoundEvent[] = [];
    #accumulator = 0;
    #ended = false;

    readonly #onViewportChanged = (): void => this.#relayout();

    constructor(deps: AppDeps) {
        super({ key: SCENE_GAME });
        this.#deps = deps;
    }

    /** Fetches the sprite pack; the renderer bakes it into textures in `create()`. */
    preload(): void {
        preloadSprites(this);
    }

    create(): void {
        applyRenderScale(this);

        this.#pending = [];
        this.#accumulator = 0;
        this.#ended = false;
        this.#selection = null;

        const sim = new Simulation(this.#deps.flow.level, this.#deps.maps);
        this.#sim = sim;
        this.#layout = this.#buildLayout(sim);
        this.#transform = createViewTransform(this.#layout.board);

        this.#view = this.#deps.createView(this);
        this.#view.create(this.#layout, sim.map);
        this.#input = this.#deps.createInput(() => this.#context());

        // Every round — first play, Retry and Next Level alike — announces itself.
        this.#deps.flow.beginRound();

        this.input.on('pointerdown', this.#onPointerDown, this);
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#teardown, this);
    }

    update(_time: number, deltaMs: number): void {
        const sim = this.#sim;
        const view = this.#view;
        if (!sim || !view) return;

        const paused = this.#deps.flow.state === 'paused';
        let alpha = 1;

        if (!paused && !this.#ended) {
            this.#accumulator = Math.min(this.#accumulator + deltaMs, MAX_CATCHUP_MS);
            while (this.#accumulator >= STEP_MS) {
                sim.step();
                this.#accumulator -= STEP_MS;
            }
            alpha = this.#accumulator / STEP_MS;
        }

        sim.drainEvents(this.#pending);
        view.present(sim.snapshot(), this.#pending, { selection: this.#selection, paused }, alpha);
        this.#pending.length = 0;

        if (!this.#ended && sim.phase !== 'playing') this.#endRound(sim);
    }

    // -- input -------------------------------------------------------------

    #onPointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.#ended || !this.#input) return;
        const action = this.#input.pick(pointer.worldX, pointer.worldY);
        if (action) this.#apply(action);
    }

    /** Turns a tap into a command or a UI move. No rules live here. */
    #apply(action: PlayAction): void {
        const sim = this.#sim;
        const flow = this.#deps.flow;
        if (!sim) return;

        switch (action.kind) {
            case 'pause':
                flow.pause();
                break;
            case 'resume':
                flow.resume();
                break;
            case 'callWave':
                sim.handle({ kind: 'callWave' });
                break;
            case 'selectSpot':
                this.#selection = { kind: 'spot', spotId: action.spotId };
                break;
            case 'selectTower':
                this.#selection = { kind: 'tower', towerId: action.towerId };
                break;
            case 'clearSelection':
                this.#selection = null;
                break;
            case 'build': {
                const selection = this.#selection;
                if (selection?.kind !== 'spot') break;
                if (sim.build(selection.spotId, action.tower)) {
                    // Hand the fresh tower its own menu, so Upgrade is one tap away.
                    const built = sim.towers.find((tower) => tower.spotId === selection.spotId);
                    this.#selection = built ? { kind: 'tower', towerId: built.id } : null;
                }
                break;
            }
            case 'upgrade': {
                const selection = this.#selection;
                if (selection?.kind !== 'tower') break;
                sim.upgrade(selection.towerId);
                break;
            }
            case 'sell': {
                const selection = this.#selection;
                if (selection?.kind !== 'tower') break;
                if (sim.sell(selection.towerId)) this.#selection = null;
                break;
            }
        }
    }

    #context(): PlayContext | null {
        const layout = this.#layout;
        const transform = this.#transform;
        const sim = this.#sim;
        if (!layout || !transform || !sim) return null;
        return {
            layout,
            transform,
            spots: sim.map.spots,
            towers: sim.towers,
            selection: this.#selection,
            canCallWave: sim.waveState === 'grace' || sim.waveState === 'gap',
            paused: this.#deps.flow.state === 'paused',
        };
    }

    // -- round end ---------------------------------------------------------

    /** Reports the score, then hands over to the Result Panel. */
    #endRound(sim: Simulation): void {
        if (this.#ended) return;
        this.#ended = true;

        const outcome = sim.phase === 'won' ? 'victory' : 'defeat';
        const score = sim.score;

        this.time.delayedCall(RESULT_DELAY_MS, () => {
            this.#deps.flow.endRound(outcome, score);
            this.scene.start(SCENE_RESULT);
        });
    }

    // -- layout ------------------------------------------------------------

    #buildLayout(sim: Simulation): PlayLayout {
        const viewport = this.#deps.viewport.current();
        return computePlayLayout({
            width: viewport.width,
            height: viewport.height,
            safeTop: viewport.safeTop,
            safeBottom: viewport.safeBottom,
            spots: sim.map.spots,
        });
    }

    #relayout(): void {
        const sim = this.#sim;
        if (!sim) return;
        this.#layout = this.#buildLayout(sim);
        this.#transform = createViewTransform(this.#layout.board);
        this.#view?.relayout(this.#layout);
    }

    // -- teardown ----------------------------------------------------------

    #teardown(): void {
        this.input.off('pointerdown', this.#onPointerDown, this);
        this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.#view?.destroy();
        this.#view = null;
        this.#input = null;
        this.#layout = null;
        this.#transform = null;
        this.#sim = null;
        this.#selection = null;
        this.#pending = [];
    }
}
