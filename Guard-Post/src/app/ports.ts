import type { GameCommand, RoundSnapshot, TowerType } from '../domain/types.ts';

/**
 * The contracts every component speaks through.
 *
 * Nothing here knows about Phaser, the DOM or `window`. Concrete implementations are
 * chosen in the composition root and handed to whoever declares a need for them, which
 * is what keeps every component replaceable and runnable in isolation.
 */

/**
 * Input adapter → game logic.
 *
 * Implemented by the simulation. Commands carry world ids (spotId, towerId) only — the
 * conversion from screen pixels happens before anything reaches this port.
 */
export interface GameCommandPort {
    build(spotId: number, tower: TowerType): boolean;
    upgrade(towerId: number): boolean;
    sell(towerId: number): boolean;
    callWave(): boolean;
    handle(command: GameCommand): boolean;
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
