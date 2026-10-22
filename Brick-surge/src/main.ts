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

    new Phaser.Game({
        type: Phaser.CANVAS, // Canvas only — WebGL must never be enabled (§3.4)
        parent,
        backgroundColor: '#0b1020',
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: {
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
}

void boot('game-container');
