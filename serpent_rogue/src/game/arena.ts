// arena.ts — the arena a stage plays on: the grid plus the cell range its
// walls allow. Pure geometry, no rules and no rendering, so both the engine
// and a headless test resolve "where may this entity exist?" the same way.

import type { ArenaBounds, Cell, Layout } from '../core/types.ts';
import { gridLayout, type GridLayout } from '../core/uiLayout.ts';

export interface Arena {
  /** Full grid the playfield is divided into. */
  grid: GridLayout;
  /** Cell range currently inside the arena walls (min inclusive, max exclusive). */
  bounds: ArenaBounds;
}

/**
 * Resolves the live arena for a screen size and the stage's wall inset.
 *
 * Every producer of grid cells (food, rocks) and every consumer of them
 * (movement, wall collision) goes through this, which is what keeps an entity
 * from being born behind a contracted wall.
 */
export function arenaFor(layout: Layout, shrinkInset: number): Arena {
  const grid = gridLayout(layout.gameW, layout.gameH);

  return {
    grid,
    bounds: {
      minCol: shrinkInset,
      minRow: shrinkInset,
      maxCol: grid.cols - shrinkInset,
      maxRow: grid.rows - shrinkInset,
    },
  };
}

/** True when a cell lies inside the arena walls. */
export function containsCell(bounds: ArenaBounds, cell: Cell): boolean {
  return (
    cell.col >= bounds.minCol &&
    cell.col < bounds.maxCol &&
    cell.row >= bounds.minRow &&
    cell.row < bounds.maxRow
  );
}
