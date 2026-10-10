import { waitForBridge } from './jsbridge.ts';
import { StartGame } from './game/main.ts';

/**
 * Entry point.
 *
 * Nothing is created before the host bridge is available (`jsbridge.ts` §4.2): in the
 * WebView the bridge is injected by the host, and `IS_DEVELOPMENT_MODE` lets the same build
 * run in a plain browser where it never appears.
 */
void waitForBridge().then((ready) => {
    if (!ready) {
        console.warn('Bridge unavailable: the game was not started.');
        return;
    }

    StartGame('game-container');
});
