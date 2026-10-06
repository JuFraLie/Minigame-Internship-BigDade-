// food.ts — Food spawning, types, magnet movement, and collection.
// Pure game logic: operates in grid space.

import { FOOD } from '../config/gameConfig.ts';
import type { ArenaBounds, Cell } from '../core/types.ts';
import { containsCell } from './arena.ts';

export type FoodKind = 'normal' | 'golden' | 'poison';

export interface FoodItem {
  cell: Cell;
  kind: FoodKind;
  /** Animation pulse phase */
  phase: number;
}

export class FoodSpawner {
  food: FoodItem[] = [];

  /**
   * Spawn food on a random empty cell **inside the given arena**.
   *
   * The bounds are mandatory rather than optional: a contracted stage must not
   * be handed an orb in the dead zone behind its walls. Returns whether an orb
   * was actually placed, so a caller topping the board up can stop instead of
   * spinning when the arena has no room left.
   */
  spawnFood(
    bounds: ArenaBounds,
    isOccupied: (c: Cell) => boolean,
    goldenChance: number = FOOD.GOLDEN_CHANCE,
  ): boolean {
    const cell = this.randomEmpty(bounds, isOccupied);
    if (!cell) return false;

    const roll = Math.random();
    let kind: FoodKind = 'normal';
    if (roll < goldenChance) {
      kind = 'golden';
    } else if (roll < goldenChance + FOOD.POISON_CHANCE) {
      kind = 'poison';
    }

    this.food.push({ cell, kind, phase: 0 });
    return true;
  }

  /**
   * Drops every orb standing outside the arena walls — the ones a contracting
   * stage just cut off — and reports how many were removed.
   */
  cullOutside(bounds: ArenaBounds): number {
    const before = this.food.length;
    this.food = this.food.filter((f) => containsCell(bounds, f.cell));
    return before - this.food.length;
  }

  /**
   * Advance animations
   */
  update(dt: number): void {
    for (const f of this.food) {
      f.phase += dt * 4;
    }
  }

  /**
   * Magnet pull: moves food items toward the snake head if within range.
   */
  pullTowardHead(head: Cell, range: number, isOccupied: (c: Cell) => boolean): void {
    if (range <= 0) return;

    for (const f of this.food) {
      const dCol = head.col - f.cell.col;
      const dRow = head.row - f.cell.row;
      const dist = Math.abs(dCol) + Math.abs(dRow); // Manhattan distance

      if (dist > 0 && dist <= range) {
        // Step 1 cell toward head along primary axis
        let nextCol = f.cell.col;
        let nextRow = f.cell.row;

        if (Math.abs(dCol) >= Math.abs(dRow)) {
          nextCol += Math.sign(dCol);
        } else {
          nextRow += Math.sign(dRow);
        }

        const nextCell: Cell = { col: nextCol, row: nextRow };
        // Don't pull into occupied obstacles unless it's the head itself (eating it)
        if ((nextCell.col === head.col && nextCell.row === head.row) || !isOccupied(nextCell)) {
          f.cell = nextCell;
        }
      }
    }
  }

  /** Check if the given cell has food. Returns index or -1. */
  foodAt(cell: Cell): number {
    for (let i = 0; i < this.food.length; i++) {
      if (this.food[i].cell.col === cell.col && this.food[i].cell.row === cell.row) {
        return i;
      }
    }
    return -1;
  }

  /** Remove and return the food at index */
  eat(index: number): FoodItem {
    return this.food.splice(index, 1)[0];
  }

  private randomEmpty(bounds: ArenaBounds, isOccupied: (c: Cell) => boolean): Cell | null {
    const cols = bounds.maxCol - bounds.minCol;
    const rows = bounds.maxRow - bounds.minRow;
    if (cols <= 0 || rows <= 0) return null;

    // Random tries first
    for (let i = 0; i < 60; i++) {
      const cell: Cell = {
        col: bounds.minCol + Math.floor(Math.random() * cols),
        row: bounds.minRow + Math.floor(Math.random() * rows),
      };
      if (!isOccupied(cell) && this.foodAt(cell) === -1) return cell;
    }

    // Fallback: full scan of the arena
    const empties: Cell[] = [];
    for (let r = bounds.minRow; r < bounds.maxRow; r++) {
      for (let c = bounds.minCol; c < bounds.maxCol; c++) {
        const cell: Cell = { col: c, row: r };
        if (!isOccupied(cell) && this.foodAt(cell) === -1) {
          empties.push(cell);
        }
      }
    }
    if (empties.length === 0) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }
}
