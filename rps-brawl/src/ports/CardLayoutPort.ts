import type { Sign } from '../core/types.ts';

/**
 * A rectangle in *screen space*, as produced by the renderer's layout.
 *
 * The input adapter is the only place allowed to translate these coordinates
 * into a game-world pick, so this is the contract that crosses the boundary
 * between the two worlds.
 */
export interface CardRegion {
  readonly sign: Sign;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The renderer's answer to "where are my cards right now?". */
export interface CardLayout {
  readonly regions: ReadonlyArray<CardRegion>;
}
