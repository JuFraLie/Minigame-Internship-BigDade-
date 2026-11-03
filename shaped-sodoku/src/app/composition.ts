import Phaser from 'phaser';

import type { ClockPort } from '../domain/ports.ts';
import { createHostBridge } from '../bridge/hostBridge.ts';
import { InputAdapter } from '../input/InputAdapter.ts';
import { PhaserCanvasRenderer } from '../render/PhaserCanvasRenderer.ts';
import { Game } from '../scenes/Game.ts';
import { GameOver } from '../scenes/GameOver.ts';
import { MainMenu } from '../scenes/MainMenu.ts';
import type { AppDeps } from './deps.ts';
import { createSession, sessionSeed } from './session.ts';
import { applyRenderScale, createViewport, designSize, renderScale, VIEWPORT_CHANGED } from './viewport.ts';

const RESIZE_DEBOUNCE_MS = 80;

/**
 * The composition root — the one place in the project that knows which concrete
 * classes exist.
 *
 * The scenes declare what they need (`AppDeps`) and this function decides that means a
 * `PhaserCanvasRenderer`, an `InputAdapter`, the host bridge and a session. Nothing else
 * reaches for a concrete implementation: the render, input and bridge layers never import
 * one another, and the domain imports none of them.
 *
 * Phaser is instantiated as `Phaser.CANVAS`, never AUTO or WEBGL.
 */
export function createGame(parent: string): Phaser.Game {
    const viewport = createViewport();
    const size = designSize();
    const scale = renderScale();

    const clock: ClockPort = { now: () => Date.now() };

    const deps: AppDeps = {
        bridge: createHostBridge(),
        session: createSession(sessionSeed()),
        clock,
        viewport,
        createRenderer: (scene) => new PhaserCanvasRenderer(scene, renderScale),
        createInput: (layoutOf) => new InputAdapter(layoutOf),
    };

    const game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent,
        backgroundColor: '#1b2450',
        // Backing store is design size × device pixel ratio; each scene's camera zooms to
        // match, so every scene can lay itself out in plain design units.
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

    // Portrait aspect ratios vary a lot, and the URL bar changing height counts as a
    // resize too. Debounced so a drag-to-collapse does not relayout on every frame.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            const next = designSize();
            const nextScale = renderScale();
            game.scale.setGameSize(Math.round(next.width * nextScale), Math.round(next.height * nextScale));
            for (const scene of game.scene.scenes) applyRenderScale(scene);
            game.events.emit(VIEWPORT_CHANGED);
        }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return game;
}
