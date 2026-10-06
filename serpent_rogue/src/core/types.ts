// core/types.ts — shared contracts.
// Depends on nothing, so every layer (engine, game, input, render) may import it.

/** Lifecycle of a run. */
export type GameState = 'start' | 'playing' | 'upgrading' | 'dead';

/** Direction on the grid. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Upgrade rarity. */
export type Rarity = 'common' | 'rare';

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

/** Grid cell coordinates (column, row). */
export interface Cell {
  col: number;
  row: number;
}

/**
 * Cell range the current arena actually plays on: `minCol`/`minRow` inclusive,
 * `maxCol`/`maxRow` exclusive.
 *
 * A contracting stage narrows this range, so every cell the rules
 * hand out — food spawns, rock spawns, movement — has to be resolved against it
 * instead of against the full grid, or entities end up in the dead zone the
 * walls have claimed, where the serpent can never reach them.
 */
export interface ArenaBounds {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
}

/**
 * Read-only view of the playfield that gameplay needs.
 * Implemented by the engine's Viewport so the game never touches the DOM.
 */
export interface Layout {
  readonly gameW: number;
  readonly gameH: number;
}

/** Buffered direction change, drained once per step while a run is active. */
export interface DirectionSource {
  consume(): Direction | null;
}

/** Buffered UI taps in playfield coordinates, drained once per frame. */
export interface PointerSource {
  consume(): Point | null;
}
