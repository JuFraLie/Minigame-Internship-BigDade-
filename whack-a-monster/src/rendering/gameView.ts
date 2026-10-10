import type Phaser from 'phaser';
import { holePosition } from '../core/config.ts';
import type { FxPort } from '../core/ports.ts';
import type { MonsterView, WorldEvent, WorldEventSink } from '../core/types.ts';
import { FxSystem } from './fx.ts';
import { Hud } from './hud.ts';
import { computeLayout } from './layout.ts';
import type { Layout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { WorldView } from './worldView.ts';

/**
 * The slice of the round this screen draws. Declared as a port so the drawing layer reads
 * a contract instead of the simulation's class — `core/world.ts`'s `GameWorld` satisfies it
 * structurally (AGENTS.md §4.3).
 */
export interface RoundDisplayPort {
    readonly monsters: readonly MonsterView[];
    readonly score: number;
    readonly lives: number;
    readonly maxLives: number;
    readonly combo: number;
    /** @returns an unsubscribe function. */
    subscribe(sink: WorldEventSink): () => void;
}

/** One screen size of drawing: layout plus the three layers built from it. */
interface PlayLayer {
    layout: Layout;
    world: WorldView;
    hud: Hud;
    fx: FxSystem;
}

/**
 * The gameplay drawing layer: grass and holes, monster sprites, the live HUD and the
 * decorative effects, laid out for one screen size.
 *
 * The scene owns the round and the frame loop; this owns the pixels. It reads the round
 * only through `RoundDisplayPort`, turns its events into decoration (a defeat pops up its
 * score, a crack bumps the monster) and never touches a rule. A viewport change rebuilds
 * the layer around the round that is already in progress — the score survives it.
 */
export class GameView {
    private readonly scene: Phaser.Scene;
    private readonly world: RoundDisplayPort;
    private readonly now: () => number;
    private layer: PlayLayer;
    private unsubscribe: (() => void) | null;

    constructor(scene: Phaser.Scene, world: RoundDisplayPort, now: () => number) {
        this.scene = scene;
        this.world = world;
        this.now = now;
        this.layer = buildLayer(scene, world, now);
        this.unsubscribe = world.subscribe((event) => this.onWorldEvent(event));
    }

    /** Layout of the current screen; the input adapter converts pointers through it. */
    get layout(): Layout {
        return this.layer.layout;
    }

    /** Decoration port handed to the input adapter for tap and swipe feedback. */
    get fxPort(): FxPort {
        return this.layer.fx;
    }

    /** Ages the effects and brings sprites and HUD in line with the round. Allocates nothing per frame. */
    update(): void {
        const { fx, world, hud } = this.layer;
        fx.update();
        world.sync(this.world.monsters);
        syncHud(hud, this.world);
    }

    /** Drops the drawing layer and lays it out again for a new screen size. */
    relayout(): void {
        destroyLayer(this.layer);
        this.layer = buildLayer(this.scene, this.world, this.now);
    }

    /** Drops the drawing layer and the event subscription (scene teardown). */
    dispose(): void {
        destroyLayer(this.layer);
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    /** Simulation events only ever drive decoration here; scoring and audio happen elsewhere. */
    private onWorldEvent(event: WorldEvent): void {
        const fx = this.layer.fx;

        switch (event.type) {
            case 'monsterDefeated':
                fx.scorePop(holePosition(event.hole), event.earned, event.multiplier);
                break;
            case 'monsterCracked':
                fx.armorBump(holePosition(event.hole));
                break;
            case 'monsterDeflected':
                fx.tapMark(holePosition(event.hole));
                break;
            default:
                break;
        }
    }
}

/** Measures the screen and builds the three drawing layers from one layout. */
function buildLayer(scene: Phaser.Scene, round: RoundDisplayPort, now: () => number): PlayLayer {
    const layout = computeLayout(measureViewport());
    const layer: PlayLayer = {
        layout,
        world: new WorldView(scene, layout),
        hud: new Hud(scene, layout, round.maxLives),
        fx: new FxSystem(scene, layout, now),
    };
    syncHud(layer.hud, round);
    return layer;
}

/** Drops one screen size of drawing without touching the round. */
function destroyLayer(layer: PlayLayer): void {
    layer.fx.clear();
    layer.world.destroy();
    layer.hud.destroy();
}

function syncHud(hud: Hud, round: RoundDisplayPort): void {
    hud.sync({
        score: round.score,
        lives: round.lives,
        maxLives: round.maxLives,
        combo: round.combo,
    });
}
