// core/types.ts — shared contracts.
// Depends on nothing, so every layer (engine, game, input, render, scenes)
// may import it.

/** Lifecycle of a run. */
export type GameState = 'start' | 'playing' | 'dead';

/** What a single player input means to the game. */
export type InputAction = 'jump' | 'slide' | null;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Read-only view of the playfield that gameplay and views need.
 * Implemented by the engine's Viewport so no other layer touches the DOM.
 * World coordinates are edge-to-edge: x ∈ [0, gameW], y ∈ [0, gameH],
 * with no fixed aspect ratio (§3.1).
 */
export interface Layout {
  readonly gameW: number;
  readonly gameH: number;
  /** Reserved top padding (safe-area inset + fallback %) so the HUD is never
   *  cut off by status-bar icons or display cutouts (§3.1). */
  readonly topInset: number;
  floorY(): number;
  ceilY(): number;
  knightX(): number;
}

/**
 * Maps screen-space (client/viewport) coordinates into game-world
 * coordinates (§4.3). Implemented by the Viewport; used by input adapters.
 */
export interface GameSpace {
  toGameX(clientX: number): number;
  toGameY(clientY: number): number;
}

/** Buffered player actions, drained once per frame while a run is active. */
export interface ActionSource {
  consume(): InputAction;
}

/** Buffered UI taps in game-world coordinates, drained once per frame. */
export interface PointerSource {
  consume(): Point | null;
}

/**
 * Raw pointer transitions in SCREEN space (client coordinates): the producing
 * counterpart of ActionSource / PointerSource. The render layer (the scenes)
 * forwards them in; the input adapters translate them into game semantics and,
 * for points, into world coordinates through GameSpace before any consumer of
 * the game sees a coordinate (§4.3). Touch is the primary scheme (§3.2) —
 * Phaser's unified pointer model delivers a desktop mouse as these very same
 * transitions, so no separate mouse path exists.
 */
export interface PointerFeed {
  /** The pointer went down at a screen point (gesture starts here). */
  down(clientX: number, clientY: number): void;
  /** The pointer was released at a screen point (a tap ends here). */
  up(clientX: number, clientY: number): void;
}

/** The one answer that clears a trap: jump over it, shield through it, run under it. */
export type TrapCounter = 'jump' | 'shield' | 'run_under';

/**
 * An incoming trap reduced to what the PICKUP layer may know about it: which
 * answer clears it and where it sits. Deliberately NOT the obstacle itself —
 * the trap and the coins stay two separate components that only meet through
 * this contract (§4.3), and nothing here can ever change how hard the run is.
 */
export interface TrapPreview {
  counter: TrapCounter;
  /** World X of the trap's left edge (its spawn point). */
  x: number;
  /** Width of the hazard in px — 0 for a point-sized one (a bat). */
  width: number;
}
