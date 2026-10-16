import { RoundSession } from '../app/roundSession.ts';
import type { BridgePort, RandomPort } from '../core/ports.ts';
import { hostBridge } from '../platform/hostBridge.ts';

/**
 * Composition root (AGENTS.md §4.3: wiring happens outside the components).
 *
 * Scenes never name `hostBridge` themselves — they ask for the ports bound here, so
 * swapping the bridge adapter is a one-line change in this file and nothing else.
 *
 * `sessionState` is the one piece of mutable game-wide memory: which level the next round
 * plays. It lives in a plain variable and is never written to storage of any kind — every
 * launch starts again at level 1 (AGENTS.md §3.4).
 */

/** Host signals, channel `gameState`. */
export const bridgePort: BridgePort = hostBridge;

/** Injected randomness; a test pins it to make a level reproducible. */
export const randomPort: RandomPort = Math.random;

export const sessionState = {
    level: 1,
};

/** Builds a fresh round for the level the session is currently on. */
export const createRoundSession = (): RoundSession =>
    new RoundSession({ bridge: bridgePort, random: randomPort, level: sessionState.level });

/** Next Level: the session moves on and the round is rebuilt from the new level. */
export const advanceLevel = (): void => {
    sessionState.level += 1;
};
