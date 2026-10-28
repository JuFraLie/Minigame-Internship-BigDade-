/**
 * Domain ports — the only contracts the domain layer depends on.
 *
 * Every port here is a tiny typed interface with no implementation detail.
 * Concrete implementations live in src/adapters and are wired in main.ts
 * (the composition root), never inside the domain.
 */

import type { DomainEvent, PowerUpKind, WorldSnapshot } from './types.ts';

/** Deterministic source of randomness in [0, 1). Injected so tests are reproducible. */
export interface RandomPort {
    next(): number;
}

/** Monotonic-ish clock in milliseconds. Injected so tests can control time. */
export interface ClockPort {
    now(): number;
}

/** Where the domain publishes typed events (ball lost, brick destroyed, round ended...). */
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

/** One-shot procedural sound effects. Power-up kinds double as their own
 *  pickup motif, so an event's `kind` can be played straight through. */
export type SoundName =
    | 'paddle'      // ball rebounds off the paddle
    | 'brickHit'    // brick damaged, not destroyed
    | 'brickBreak'  // brick destroyed
    | 'wave'        // wave cleared — short fanfare
    | 'lost'        // a ball fell past the paddle
    | 'saved'       // the shield caught a ball
    | 'gameOver'    // the run ended
    | 'click'       // UI buttons
    | 'tick'        // serve countdown
    | PowerUpKind;  // pickups play their own motif (multi, wide, slow, fire, shield, shrink)

/** Anything that can play the game's sound effects. Like RendererPort it is
 *  consumed by the presentation layer, never by the domain itself; implemented
 *  by the WebAudio adapter (every note synthesized — no audio files). */
export interface SoundPort {
    /** Start the audio device. Must run inside a user gesture (iOS/Chrome). */
    unlock(): void;
    /** Fire a one-shot effect. No-op while muted or before the first gesture. */
    play(name: SoundName, options?: { pitch?: number }): void;
    /** Mute/unmute — session-wide, survives scene changes. */
    setMuted(muted: boolean): void;
    readonly muted: boolean;
}
