import type { Board } from './Board.ts';
import type { LineRef } from './Rules.ts';
import type { ShapeId } from './shapes.ts';

/**
 * The contracts every layer speaks through.
 *
 * Nothing here knows about Phaser, the DOM or `window`; concrete implementations are
 * chosen in `src/app/` and handed to whoever declares a need for them.
 */

/** Anything the game needs from a source of randomness. */
export interface RandomPort {
    /** A float in `[0, 1)`. */
    next(): number;
}

/** Milliseconds from an arbitrary epoch. Lets tests drive time deterministically. */
export interface ClockPort {
    now(): number;
}

/**
 * Commands the player can issue.
 *
 * These carry puzzle coordinates only — never pixels. Mapping a tap on the canvas to a
 * cell is the input layer's job, and it happens before anything reaches the domain.
 */
export type GameCommand =
    | { readonly kind: 'selectCell'; readonly row: number; readonly col: number }
    | { readonly kind: 'pickShape'; readonly shape: ShapeId };

/** Everything the render layer needs to redraw a round in one pass. */
export interface RoundSnapshot {
    readonly board: Board;
    readonly phase: RoundPhase;
    readonly hearts: number;
    readonly maxHearts: number;
    readonly score: number;
    readonly streak: number;
    readonly multiplier: number;
    readonly level: number;
    /** The cell awaiting a shape, or `null` when nothing is selected. */
    readonly selected: number | null;
    /** Shapes still needed to finish the round; index equals the shape id. */
    readonly tray: readonly number[];
    readonly parSeconds: number;
    readonly secondsLeft: number;
}

export type RoundPhase = 'playing' | 'won' | 'lost';

/**
 * What a round tells the outside world while it runs.
 *
 * The render layer turns these into tweens; tests record them. Either way the domain
 * never sees a sprite.
 */
export type RoundEvent =
    | { readonly type: 'selected'; readonly index: number }
    | {
          readonly type: 'correct';
          readonly index: number;
          readonly shape: ShapeId;
          readonly gained: number;
          readonly multiplier: number;
          readonly score: number;
      }
    | {
          readonly type: 'wrong';
          readonly index: number;
          readonly shape: ShapeId;
          readonly penalty: number;
          readonly score: number;
          readonly hearts: number;
      }
    | { readonly type: 'linesCompleted'; readonly lines: readonly LineRef[]; readonly bonus: number; readonly score: number }
    | { readonly type: 'timeBonus'; readonly bonus: number; readonly score: number }
    | { readonly type: 'won'; readonly score: number }
    | { readonly type: 'lost'; readonly score: number };

/** The round's outgoing channel. */
export interface EventsOutPort {
    emit(event: RoundEvent): void;
}

/**
 * One-shots the game can ask to hear.
 *
 * Every one of these is synthesised at play time from oscillators and shaped noise. There
 * is not an audio file anywhere in the project, for the same reason there is no image
 * file: nothing to fetch, nothing to license, nothing that can 404 on a static host.
 */
export type SoundName =
    /** A button went down. */
    | 'tap'
    /** A cell or a shape was highlighted. */
    | 'select'
    /** A shape landed where it belongs; `step` is the streak. */
    | 'place'
    /** A shape landed somewhere it does not. */
    | 'mistake'
    /** A row, column or box closed; `step` is how many closed at once. */
    | 'lines'
    /** The round was cleared. */
    | 'win'
    /** The hearts ran out. */
    | 'lose'
    /** A level was rolled forward. */
    | 'levelUp';

/** The loop playing underneath a screen. One track so far, named for its style. */
export type MusicTrack = 'lofi';

/**
 * What the game plays out loud.
 *
 * A port like every other: the scenes say *what* should be heard, and `src/app/` decides
 * which synthesiser provides it. Nothing here knows that an `AudioContext` exists.
 */
export interface SoundPort {
    /**
     * Hands the audio device over to the game.
     *
     * Browsers refuse to start audio outside a user gesture, so the composition root
     * calls this on the first tap. Calling it twice is harmless; never calling it means
     * the game runs silent rather than broken.
     */
    unlock(): void;

    /** Plays a one-shot. `step` raises the pitch — a streak, a double line, a new level. */
    play(name: SoundName, step?: number): void;

    /** Starts the loop, or fades it out with `null`. Asking for the current track is a no-op. */
    music(track: MusicTrack | null): void;

    /** Whether audio is currently silenced. */
    readonly muted: boolean;

    /** Flips mute and reports the state it landed on. */
    toggleMute(): boolean;
}

/**
 * The host shell.
 *
 * `launch` fires once per session after Play, `startRound` at every round start,
 * `endRound` when the Result Panel appears, and `exit` at most once.
 */
export interface BridgePort {
    launch(): void;
    startRound(): void;
    endRound(win: boolean, score: number): void;
    exit(win: boolean, score: number): void;
}

/**
 * State that outlives a single scene: the level being played, the seed that produced its
 * puzzle, and the last reported result. Session-scoped only — never persisted.
 */
export interface SessionPort {
    readonly level: number;
    /** Seed of the current level's puzzle. Retry replays it; the next level replaces it. */
    readonly puzzleSeed: number;
    readonly lastScore: number;
    readonly lastWin: boolean;
    /** Records the result shown on the Result Panel. */
    recordResult(win: boolean, score: number): void;
    /** Rolls to the next level, drawing a fresh puzzle seed. */
    advanceLevel(): void;
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
 * The live viewport.
 *
 * Read through a port rather than the DOM directly, so a component never has to know that
 * a `window` exists — and so tests can hand it a fixed size.
 */
export interface ViewportPort {
    current(): ViewportSnapshot;
}
