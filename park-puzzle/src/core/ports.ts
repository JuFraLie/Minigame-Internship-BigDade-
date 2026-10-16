/**
 * The contracts of the game, declared in one place and implemented outside of it.
 *
 * The domain never imports an implementation of these interfaces: it only calls them,
 * which is what lets a whole round run headless in a test and keeps the host bridge and
 * any future sound effects swappable (AGENTS.md §4.3).
 *
 * They live together rather than inside the folder that happens to call them so that no
 * adapter has to reach into another adapter for a type.
 */

/** Host application signals, channel `gameState`. Implemented by `platform/hostBridge.ts`. */
export interface BridgePort {
    /** Exactly once, after the player presses Play on the Play Screen. */
    launch(): void;
    /** At every round start, including every Retry and every Next Level. */
    startRound(): void;
    /** When the Result Panel appears. */
    endRound(win: boolean, score: number): void;
    /** At most once, when the player presses Exit on the Result Panel. */
    exit(win: boolean, score: number): void;
}

/** Injectable source of randomness, so a level can be reproduced exactly in a test. */
export type RandomPort = () => number;

/** What one round of the simulation reports as it runs. Implemented by `app/roundSession.ts`. */
export type RoundEvent =
    | { type: 'carReleased'; id: number }
    | { type: 'carCleared'; id: number; points: number; multiplier: number }
    | { type: 'nearMiss'; id: number; points: number }
    | { type: 'carBlocked'; id: number }
    | { type: 'carCrashed'; id: number; lives: number }
    | { type: 'roundWon'; points: number }
    | { type: 'roundLost' };

export type RoundEventsPort = (event: RoundEvent) => void;

/**
 * The renderer's whole surface: it is handed a read-only snapshot of the round and draws
 * it. Declared as a port so the simulation never learns that a renderer exists.
 */
export interface RenderPort {
    draw(snapshot: import('./world.ts').WorldSnapshot): void;
}
