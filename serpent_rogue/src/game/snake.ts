// snake.ts — Snake entity with grid-based movement, wrap support, and body manipulation.
// Pure game logic, no rendering.

import type { Cell, Direction } from '../core/types.ts';

function opposite(d: Direction): Direction {
  switch (d) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
  }
}

export function stepCell(cell: Cell, dir: Direction): Cell {
  switch (dir) {
    case 'up': return { col: cell.col, row: cell.row - 1 };
    case 'down': return { col: cell.col, row: cell.row + 1 };
    case 'left': return { col: cell.col - 1, row: cell.row };
    case 'right': return { col: cell.col + 1, row: cell.row };
  }
}

export class Snake {
  body: Cell[];
  direction: Direction;
  private dirQueue: Direction[] = [];
  private growPending = 0;
  phaseTailTimer = 0;
  venomTrail: { cell: Cell; life: number }[] = [];

  constructor(startCol: number, startRow: number, length: number, dir: Direction = 'right') {
    this.body = [];
    this.direction = dir;

    // The tail trails BEHIND the head: for a snake heading right the older
    // segments sit at smaller columns (and likewise on every other axis).
    // Spawning them ahead of the head made the snake collide with its own
    // body on the very first straight step.
    for (let i = 0; i < length; i++) {
      const opp = opposite(dir);
      this.body.push({
        col: startCol + (opp === 'right' ? i : opp === 'left' ? -i : 0),
        row: startRow + (opp === 'down' ? i : opp === 'up' ? -i : 0),
      });
    }
  }

  get head(): Cell {
    return this.body[0];
  }

  get length(): number {
    return this.body.length;
  }

  get isPhaseTailActive(): boolean {
    return this.phaseTailTimer > 0;
  }

  updateTimers(dt: number): void {
    if (this.phaseTailTimer > 0) {
      this.phaseTailTimer = Math.max(0, this.phaseTailTimer - dt);
    }
    // Update venom trail life
    for (let i = this.venomTrail.length - 1; i >= 0; i--) {
      this.venomTrail[i].life -= dt;
      if (this.venomTrail[i].life <= 0) {
        this.venomTrail.splice(i, 1);
      }
    }
  }

  queueDirection(dir: Direction): void {
    const last = this.dirQueue.length > 0
      ? this.dirQueue[this.dirQueue.length - 1]
      : this.direction;

    if (dir === last || dir === opposite(last)) return;
    if (this.dirQueue.length >= 2) return;

    this.dirQueue.push(dir);
  }

  grow(n: number): void {
    this.growPending += n;
  }

  /**
   * Shrink snake by `count` segments from the tail.
   * Keeps at least 2 segments (head + 1 body).
   */
  shrink(count: number): number {
    const segmentsLost = Math.min(count, Math.max(0, this.body.length - 2));
    for (let i = 0; i < segmentsLost; i++) {
      this.body.pop();
    }
    return segmentsLost;
  }

  /**
   * Advance one step on the grid.
   * If wallWrap is true, wrap outside coordinates to opposite border.
   */
  step(cols: number, rows: number, minCol = 0, minRow = 0, wallWrap = false, leaveVenom = false): Cell {
    if (this.dirQueue.length > 0) {
      this.direction = this.dirQueue.shift()!;
    }

    let newHead = stepCell(this.head, this.direction);

    if (wallWrap) {
      if (newHead.col >= cols) newHead.col = minCol;
      else if (newHead.col < minCol) newHead.col = cols - 1;
      if (newHead.row >= rows) newHead.row = minRow;
      else if (newHead.row < minRow) newHead.row = rows - 1;
    }

    // Leave venom trail at current tail before moving
    if (leaveVenom && this.body.length > 0) {
      const tail = this.body[this.body.length - 1];
      this.venomTrail.push({ cell: { ...tail }, life: 4.0 });
    }

    this.body.unshift(newHead);
    if (this.growPending > 0) {
      this.growPending--;
    } else {
      this.body.pop();
    }

    return newHead;
  }

  /**
   * Check collision with own body segments (head hits tail).
   * Harmless if phase tail is active!
   */
  hitsBody(cell: Cell): boolean {
    if (this.isPhaseTailActive) return false;

    for (let i = 1; i < this.body.length; i++) {
      if (this.body[i].col === cell.col && this.body[i].row === cell.row) {
        return true;
      }
    }
    return false;
  }

  occupies(cell: Cell): boolean {
    for (const seg of this.body) {
      if (seg.col === cell.col && seg.row === cell.row) return true;
    }
    return false;
  }
}
