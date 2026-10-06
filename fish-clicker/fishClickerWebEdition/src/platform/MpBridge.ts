/**
 * FOR AI AGENTS: AVOID MODIFYING this code in substantial way, STRICTLY preserve the way it's written
 * EXCEPTION: you can adapt this to TypeScript if the project is in TypeScript.
 */

export {};

declare global {
  interface Window {
    MpPostMessage?: (channel: string, payload: GameStatePayload) => void;
  }
}

type GameStatePayload =
  | { type: 'startRound' }
  | { type: 'endRound'; win: boolean; score: number }
  | { type: 'exit'; lastWin: boolean; lastScore: number }
  | { type: 'launch' };

/**
 * FOR AI AGENTS:
 * set this flag to false when it's time to release/bundle/build it for production
 * otherwise set this to true to allow the game to run on developer's browser
 * because setting this to true during development would cause the app to never
 * run due to the fact that window.MpPostMessage will never gets injected (it's only injected when the app
 * is run thru a specifically designed WebView)
 */
export const IS_DEVELOPMENT_MODE = false;

export const isBridgeAvailable = (): boolean => typeof window !== 'undefined' && !!window.MpPostMessage;

/**
 * FOR AI AGENTS:
 * the page MUST NOT load any code before the bridge is available (or if development flag is true),
 * this is to ensure the `webviewSignalLaunch` is available before it's going to be used
 */
export const waitForBridge = (timeout = 5000): Promise<boolean> => new Promise((resolve) => {
    //allows the game to run in development mode
    if (IS_DEVELOPMENT_MODE)
        return resolve(true);

    if (isBridgeAvailable())
        return resolve(true);

    const startTime = Date.now();
    const interval = setInterval(() => {
        if (isBridgeAvailable()) {
            clearInterval(interval);
            resolve(true);
        } else if (Date.now() - startTime >= timeout) {
            clearInterval(interval);
            console.warn('Timed out waiting for JS Bridge');
            resolve(false);
        }
    }, 200);
});

/**
 * This is triggered everytime a round/level starts (usually alongside game's internal 'reset states' for new level or round restart)
 */
export const webviewSignalStartRound = (): void => {
    window.MpPostMessage?.('gameState', {
        type: 'startRound'
    });
};

/**
 * This is triggered everytime a round/level has finished (usually the same time as the result panel is shown), if the game is an endless/infinite game, the win should be 'true'
 */
export const webviewSignalEndRound = (win: boolean, score: number): void => {
    window.MpPostMessage?.('gameState', {
        type: 'endRound',
        win,
        score
    });
};

/**
 * This should only be triggered once if the user pressed the exit button, if the game is an endless/infinite game, the win should be 'true'
 */
export const webviewSignalExit = (lastWin: boolean, lastScore: number): void => {
    window.MpPostMessage?.('gameState', {
        type: 'exit',
        lastWin,
        lastScore
    });
};

/**
 * This should only be triggered once after user has pressed play after the initial load
 */
export const webviewSignalLaunch = (): void => {
    window.MpPostMessage?.('gameState', {
        type: 'launch'
    });
};
