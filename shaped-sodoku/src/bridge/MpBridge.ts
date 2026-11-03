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
 * ...
 */
export const IS_DEVELOPMENT_MODE = true;

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

export const webviewSignalStartRound = (): void => {
    window.MpPostMessage?.('gameState', { type: 'startRound' });
};

export const webviewSignalEndRound = (win: boolean, score: number): void => {
    window.MpPostMessage?.('gameState', { type: 'endRound', win, score });
};

export const webviewSignalExit = (lastWin: boolean, lastScore: number): void => {
    window.MpPostMessage?.('gameState', { type: 'exit', lastWin, lastScore });
};

export const webviewSignalLaunch = (): void => {
    window.MpPostMessage?.('gameState', { type: 'launch' });
};
