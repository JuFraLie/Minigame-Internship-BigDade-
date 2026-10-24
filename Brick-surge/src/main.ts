/**
 * Composition root — the ONLY place concrete adapters are wired to ports
 * (AGENTS.md §4.3). Boots the host bridge first (the game MUST NOT start
 * before the bridge is available), then hands the shared AppContext to the
 * scene flow: MainMenu (Play Screen) → Game → GameOver (Result Panel).
 */

import Phaser from 'phaser';
import { waitForBridge } from './adapters/bridge/jsbridge.ts';
import { MpBridge } from './adapters/bridge/MpBridge.ts';
import { EventBus } from './adapters/events/EventBus.ts';
import { MathRandom } from './adapters/random/MathRandom.ts';
import { SystemClock } from './adapters/clock/SystemClock.ts';
import { DdaController } from './domain/dda/DdaController.ts';
import type { AppContext } from './app/AppContext.ts';
import { MainMenu } from './scenes/MainMenu.ts';
import { Game } from './scenes/Game.ts';
import { GameOver } from './scenes/GameOver.ts';
import { measureViewport, renderScale, VIEWPORT_CHANGED } from './adapters/phaser/viewport.ts';

async function boot(parent: string): Promise<void> {
    // The game must not load/start before the bridge is available (§4.2).
    const bridgeReady = await waitForBridge();
    if (!bridgeReady) {
        console.warn('Bridge unavailable — continuing in development mode.');
    }

    const clock = new SystemClock();
    const ctx: AppContext = {
        bridge: new MpBridge(),
        // The DDA lives for the whole session (across Retries); nothing is stored.
        dda: new DdaController(clock),
        bus: new EventBus(),
        random: new MathRandom(),
        clock,
        lastWin: false,
        lastScore: 0,
    };

    const size = measureViewport(); // portrait playfield, not necessarily the whole window
    const density = renderScale();

    const game = new Phaser.Game({
        type: Phaser.CANVAS, // Canvas only — WebGL must never be enabled (§3.4)
        parent,
        backgroundColor: '#0b1020',
        // The backing store is density times the design size so the canvas is
        // sharp on a high-density phone; scenes zoom their camera to match
        // (see adapters/phaser/viewport.ts). In landscape the design size is a
        // portrait column — flexbox centres it and the page background (the
        // same colour) fills the sides, so the game always plays portrait-shaped.
        width: size.width * density,
        height: size.height * density,
        scale: {
            // FIT never stretches; centring is left to the CSS flex on
            // #game-container (Phaser's autoCenter writes margins a flex
            // parent centres a second time, producing a visible offset).
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.NO_CENTER,
            expandParent: true,
        },
        input: {
            // Phaser only binds touch listeners when the *device* claims touch
            // support — a desktop or DevTools emulation reports none, so touch
            // is switched on outright for this touch-first game.
            touch: true,
        },
        scene: [MainMenu, Game, GameOver],
        callbacks: {
            preBoot: (game) => {
                // Scenes receive the shared context through scene data.
                game.registry.set('ctx', ctx);
            },
        },
    });

    // Keep the canvas in step with the window (device rotation, WebView
    // settling late, URL bar collapsing, split screen). Size the backing store
    // first, then tell the screens to lay out against the new size.
    let appliedWidth = size.width * density;
    let appliedHeight = size.height * density;
    let appliedSafeTop = size.safeTop;

    const syncSize = (): void => {
        game.scale.getParentBounds();
        const next = measureViewport();
        const targetWidth = next.width * density;
        const targetHeight = next.height * density;

        if (targetWidth !== appliedWidth || targetHeight !== appliedHeight) {
            appliedWidth = targetWidth;
            appliedHeight = targetHeight;
            game.scale.setGameSize(targetWidth, targetHeight);
            game.events.emit(VIEWPORT_CHANGED);
            return;
        }
        // Same playfield size: the cutout inset may still have moved (rotating
        // a notch phone), which the HUD has to re-clear even though the canvas
        // did not change. Otherwise only the fit into the window needs a nudge.
        if (next.safeTop !== appliedSafeTop) {
            appliedSafeTop = next.safeTop;
            game.events.emit(VIEWPORT_CHANGED);
            return;
        }
        game.scale.refresh();
    };

    window.addEventListener('resize', syncSize);
    // Older WebViews report a rotation here before (or without) a resize.
    window.addEventListener('orientationchange', syncSize);
}

void boot('game-container');
