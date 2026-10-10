import type { FieldPoint } from './config.ts';

/**
 * The contracts of the game, declared in one place and implemented outside of it.
 *
 * The simulation never imports an implementation of these interfaces: it only calls them,
 * which is what lets the game run headless in tests and keeps the host bridge, the audio
 * synth and any future replacement swappable (AGENTS.md §4.3).
 *
 * They live together rather than inside the folder that happens to call them so that no
 * adapter has to reach into another adapter for a type: `input/` calls `FxPort` without
 * importing `rendering/`, and `rendering/` implements it without importing `input/`.
 */

/** Host application signals, channel `gameState`. Implemented by `platform/hostBridge.ts`. */
export interface BridgePort {
    /** Exactly once, after the player presses Play on the Play Screen. */
    launch(): void;
    /** At every round start, including every Retry. */
    startRound(): void;
    /** When the Result Panel appears. */
    endRound(win: boolean, score: number): void;
    /** At most once, when the player presses Exit on the Result Panel. */
    exit(win: boolean, score: number): void;
}

/** Procedural Web Audio cues. Implemented by `platform/synthAudio.ts`. */
export interface AudioPort {
    /** Called on the first user gesture so mobile WebViews unlock audio. */
    resume(): void;
    uiTap(): void;
    whack(): void;
    armorCrack(): void;
    heavySmash(): void;
    slash(): void;
    deflect(): void;
    escape(): void;
    roundOver(): void;
}

/** Injectable source of randomness, so spawns are deterministic under test. */
export type Random = () => number;

/**
 * Decoration port: the visual feedback a screen may play in field coordinates, or not play
 * at all. Implemented by `rendering/fx.ts`; called by `input/pointerInput.ts` (the ripple
 * and the trail of a gesture) and by the gameplay view (the score pop of a defeat).
 */
export interface FxPort {
    /** Number popped up when a monster is defeated. */
    scorePop(at: FieldPoint, value: number, multiplier: number): void;
    /** Ring around a tap. */
    tapMark(at: FieldPoint): void;
    /** Trail left behind a swipe. */
    swipeTrail(from: FieldPoint, to: FieldPoint): void;
    /** Marks a monster that needs another hit (armored). */
    armorBump(at: FieldPoint): void;
}
