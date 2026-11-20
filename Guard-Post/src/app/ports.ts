import type { GameCommand, RoundSnapshot } from '../domain/types.ts';

export type { MapSource } from '../domain/map/types.ts';

/**
 * The contracts every component speaks through.
 *
 * Nothing here knows about Phaser, the DOM or `window`. Concrete implementations are
 * chosen in the composition root and handed to whoever declares a need for them, which
 * is what keeps every component replaceable and runnable in isolation.
 */

/** Every sound the presentation layer can ask for. */
export type SfxName =
    | 'start'
    | 'build'
    | 'upgrade'
    | 'sell'
    | 'shoot'
    | 'hit'
    | 'kill'
    | 'leak'
    | 'wave'
    | 'waveClear'
    | 'levelClear'
    | 'defeat'
    | 'blocked'
    | 'speed';

/**
 * Presentation → audio.
 *
 * The scenes ask for music and one-shot sounds through this port; the adapter owns the
 * AudioContext and the synthesis, so neither the domain nor the renderer knows how a
 * sound is made. Music is idempotent: every round may ask to start it.
 */
export interface AudioPort {
    startMusic(): void;
    stopMusic(): void;
    play(name: SfxName): void;
}

/**
 * Session flow → host shell.
 *
 * Implemented by the MpBridge adapter in production and by a recording fake in tests.
 * The flow — not the adapter — decides when each signal fires.
 */
export interface HostPort {
    launch(): void;
    startRound(): void;
    endRound(win: boolean, score: number): void;
    exit(win: boolean, score: number): void;
}

/**
 * Test bot → game logic.
 *
 * Bots read a snapshot and answer with commands, exactly like the input adapter does,
 * which lets balance runs and smoke tests drive the simulation with no screen attached.
 */
export interface PlayerStrategyPort {
    decide(snapshot: RoundSnapshot): readonly GameCommand[];
}

/** Size of the device viewport, in design-space units. */
export interface ViewportSnapshot {
    readonly width: number;
    readonly height: number;
    /** Clearance at the top for the status bar and any cutout. */
    readonly safeTop: number;
    /** Clearance at the bottom for the home indicator, when the device reports one. */
    readonly safeBottom: number;
}

/**
 * The live viewport, read through a port so nothing but `src/app/` touches `window`
 * — and so tests can hand the layout a fixed size.
 */
export interface ViewportPort {
    current(): ViewportSnapshot;
}

/**
 * Start-screen credit → the outside page it points at.
 *
 * Implemented by the credit-link adapter in production; the scene only ever sees a
 * label and a tap action, so the one outbound URL in the project stays auditable in
 * exactly one file — the same arrangement as `MpBridge.ts` and the host channel.
 */
export interface CreditPort {
    /** What the Play Screen shows, e.g. who the art or the game is credited to. */
    readonly label: string;
    /** Opens the credited page. Must be called straight from a tap, never on a timer. */
    open(): void;
}
