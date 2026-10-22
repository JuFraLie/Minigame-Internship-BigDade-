/**
 * Domain ports — the only contracts the domain layer depends on.
 *
 * Every port here is a tiny typed interface with no implementation detail.
 * Concrete implementations live in src/adapters and are wired in main.ts
 * (the composition root), never inside the domain.
 */

import type { DomainEvent, WorldSnapshot } from './types.ts';

/** Deterministic source of randomness in [0, 1). Injected so tests are reproducible. */
export interface RandomPort {
    next(): number;
}

/** Monotonic-ish clock in milliseconds. Injected so tests can control time. */
export interface ClockPort {
    now(): number;
}

/** Where the domain publishes typed events (life lost, brick destroyed, round ended...). */
export interface EventSinkPort {
    emit(event: DomainEvent): void;
}

/** Anything that can draw the current world snapshot. Implemented by the Phaser adapter. */
export interface RendererPort {
    render(snapshot: WorldSnapshot): void;
}

/** The host-app bridge surface used by the game. Implemented by the bridge adapter. */
export interface GameSignalsPort {
    signalLaunch(): void;
    signalStartRound(): void;
    signalEndRound(win: boolean, score: number): void;
    signalExit(win: boolean, score: number): void;
}
