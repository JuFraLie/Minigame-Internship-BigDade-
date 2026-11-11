import Phaser from 'phaser';

import { createHostBridge } from './adapters/hostBridge.ts';
import { createCreditLink } from './adapters/creditLink.ts';
import { InputAdapter } from './adapters/phaser/inputAdapter.ts';
import { PhaserCanvasRenderer } from './adapters/phaser/renderer.ts';
import { Game } from './adapters/phaser/scenes/Game.ts';
import { GameOver } from './adapters/phaser/scenes/GameOver.ts';
import { MainMenu } from './adapters/phaser/scenes/MainMenu.ts';
import { applyRenderScale } from './adapters/phaser/scale.ts';
import { COLORS, hex } from './adapters/phaser/textures.ts';
import type { AppDeps } from './app/deps.ts';
import { createSessionFlow } from './app/sessionFlow.ts';
import { VIEWPORT_CHANGED, createViewport, designSize, renderScale } from './app/viewport.ts';

const RESIZE_DEBOUNCE_MS = 80;

/**
 * The composition root — the one place in the project that knows which concrete
 * classes exist.
 *
 * The scenes declare what they need (`AppDeps`) and this function decides that means a
 * `PhaserCanvasRenderer`, an `InputAdapter`, the host bridge and a session flow.
 * Nothing else reaches for a concrete implementation: the render, input and bridge
 * layers never import one another, and the domain imports none of them.
 *
 * Phaser is instantiated as `Phaser.CANVAS`, never AUTO or WEBGL.
 */
export function createGame(parent: string): Phaser.Game {
    const viewport = createViewport();
    const size = designSize();
    const scale = renderScale();

    const deps: AppDeps = {
        flow: createSessionFlow(createHostBridge()),
        viewport,
        credit: createCreditLink(),
        createView: (scene) => new PhaserCanvasRenderer(scene),
        createInput: (contextOf) => new InputAdapter(contextOf),
    };

    const game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent,
        backgroundColor: hex(COLORS.void),
        // Backing store is design size x device pixel ratio; each scene's camera zooms
        // to match, so every scene lays itself out in plain design units.
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        antialias: true,
        input: { touch: true, mouse: true, keyboard: false },
        scale: {
            mode: Phaser.Scale.FIT,
            // Centring is CSS's job (see public/style.css), not the canvas's.
            autoCenter: Phaser.Scale.NO_CENTER,
            expandParent: false,
        },
        scene: [new MainMenu(deps), new Game(deps), new GameOver(deps)],
    });

    // Portrait aspect ratios vary a lot, and a collapsing URL bar counts as a resize
    // too. Debounced so a drag-to-collapse does not relayout on every frame.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            const next = designSize();
            const nextScale = renderScale();
            game.scale.setGameSize(Math.round(next.width * nextScale), Math.round(next.height * nextScale));
            for (const scene of game.scene.scenes) {
                // A stopped scene has had its CameraManager shut down; every scene
                // re-applies its own render scale in create() when it comes back.
                if (scene.cameras?.main) applyRenderScale(scene);
            }
            game.events.emit(VIEWPORT_CHANGED);
        }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return game;
}
