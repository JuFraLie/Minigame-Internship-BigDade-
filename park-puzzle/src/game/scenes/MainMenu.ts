import Phaser from 'phaser';
import { bridgePort } from '../wiring.ts';
import { MenuView } from '../../render/menuView.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../../render/viewport.ts';
import { fadeIn, fadeOutAndStart } from '../../render/transition.ts';
import { loadVehicleArt } from '../../render/carTextures.ts';

/**
 * The Play Screen (AGENTS.md §2).
 *
 * The game never starts on its own: the round is only ever started from here, and it
 * starts on the PLAY button and on any tap anywhere on this screen alike. The first tap
 * of the session is also what sends `launch`, exactly once.
 */
export class MainMenu extends Phaser.Scene {
    private starting = false;
    private view: MenuView | null = null;

    constructor() {
        super('MainMenu');
    }

    /**
     * Loads the vehicle art once, at launch.
     *
     * The texture manager belongs to the game, not to a scene, so this single load covers
     * the round and the Result Panel too: `create()` below and every scene after it can
     * assume the pack is already in. A load that failed for any reason degrades to the
     * procedural texture rather than to a missing-image box.
     */
    preload(): void {
        loadVehicleArt(this);
    }

    create(): void {
        applyRenderScale(this);
        this.starting = false;
        this.view = new MenuView(this, () => this.beginRound());

        // Tapping anywhere on the Play Screen starts the game, exactly like the button.
        // Bound once: a viewport change only redraws, it never re-binds this listener.
        this.input.on('pointerdown', () => this.beginRound());

        this.game.events.on(VIEWPORT_CHANGED, this.relayout, this);
        this.events.once('shutdown', () => {
            this.game.events.off(VIEWPORT_CHANGED, this.relayout, this);
            this.view?.dispose();
            this.view = null;
        });

        fadeIn(this);
    }

    /** The Play Screen holds no state, so laying it out again just means drawing it again. */
    private relayout(): void {
        if (this.starting) return;
        this.view?.rebuild();
    }

    /**
     * Starts the round. Guarded, because the PLAY button and the tap-anywhere listener can
     * both fire for the same press — `launch` must still reach the host only once.
     */
    private beginRound(): void {
        if (this.starting) return;
        this.starting = true;

        bridgePort.launch();
        fadeOutAndStart(this, 'Game');
    }
}
