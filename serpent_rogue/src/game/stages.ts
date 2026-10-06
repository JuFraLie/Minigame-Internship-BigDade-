// stages.ts — Stage progression and stage modifiers.
// Each stage applies an environmental rule change (rocks, shrinking arena, speed, golden frenzy).

import { STAGES } from '../config/gameConfig.ts';
import type { Cell } from '../core/types.ts';

export type StageModifier = 'standard' | 'rocks' | 'shrink' | 'fast' | 'golden_frenzy';

export interface StageInfo {
  stageNumber: number;
  modifier: StageModifier;
  name: string;
  description: string;
  /** Shrink count (in cells from each border) */
  shrinkInset: number;
  /** Multiplier on food XP */
  xpMultiplier: number;
  /** Additional tick speed factor (< 1 means faster) */
  speedFactor: number;
}

export class StageManager {
  currentStage = 1;
  foodEatenThisStage = 0;
  readonly foodGoal = STAGES.FOOD_PER_STAGE;

  getStageInfo(stage: number = this.currentStage): StageInfo {
    if (stage === 1) {
      return {
        stageNumber: 1,
        modifier: 'standard',
        name: 'Neon Undercity',
        description: 'Open grid. Slither, feed, and grow.',
        shrinkInset: 0,
        xpMultiplier: 1.0,
        speedFactor: 1.0,
      };
    }

    // Cycle through exciting modifiers
    const modType = (stage - 1) % 4;
    switch (modType) {
      case 1:
        return {
          stageNumber: stage,
          modifier: 'rocks',
          name: 'Data Minefield',
          description: 'Rogue code blocks choke the grid!',
          shrinkInset: 0,
          xpMultiplier: 1.1,
          speedFactor: 0.96,
        };
      case 2:
        return {
          stageNumber: stage,
          modifier: 'shrink',
          name: 'Firewall Lockdown',
          description: 'The firewall contracts inward! Less room to maneuver.',
          shrinkInset: Math.min(STAGES.MAX_SHRINK, 1 + Math.floor(stage / 6)),
          xpMultiplier: 1.25,
          speedFactor: 1.0,
        };
      case 3:
        return {
          stageNumber: stage,
          modifier: 'fast',
          name: 'Overclock',
          description: 'Neural boost! Move speed is jacked up by 15%.',
          shrinkInset: 0,
          xpMultiplier: 1.3,
          speedFactor: 0.85,
        };
      case 0:
      default:
        return {
          stageNumber: stage,
          modifier: 'golden_frenzy',
          name: 'Chrome Rush',
          description: 'High risk, high reward! Chips give 2x XP, but junk code litters the floor.',
          shrinkInset: 0,
          xpMultiplier: 2.0,
          speedFactor: 0.92,
        };
    }
  }

  /**
   * Generate rock obstacle positions for a given stage.
   */
  generateRocks(
    cols: number,
    rows: number,
    inset: number,
    snakeCells: Cell[],
    foodCells: Cell[],
  ): Cell[] {
    const info = this.getStageInfo();
    let rockCount = 0;

    if (info.modifier === 'rocks') {
      rockCount = Math.min(STAGES.MAX_ROCKS, 2 + this.currentStage * 2);
    } else if (info.modifier === 'golden_frenzy') {
      rockCount = Math.min(STAGES.MAX_ROCKS, 4 + this.currentStage);
    } else if (this.currentStage > 2) {
      rockCount = Math.min(8, Math.floor(this.currentStage / 2));
    }

    const rocks: Cell[] = [];
    const minCol = inset + 1;
    const maxCol = cols - inset - 2;
    const minRow = inset + 1;
    const maxRow = rows - inset - 2;

    if (maxCol <= minCol || maxRow <= minRow) return rocks;

    const isBlocked = (c: Cell) => {
      // Don't spawn on snake or adjacent to snake head
      if (snakeCells.some((s) => Math.abs(s.col - c.col) <= 1 && Math.abs(s.row - c.row) <= 1)) {
        return true;
      }
      if (foodCells.some((f) => f.col === c.col && f.row === c.row)) return true;
      if (rocks.some((r) => r.col === c.col && r.row === c.row)) return true;
      return false;
    };

    let attempts = 0;
    while (rocks.length < rockCount && attempts < 100) {
      attempts++;
      const col = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
      const row = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
      const cand: Cell = { col, row };
      if (!isBlocked(cand)) {
        rocks.push(cand);
      }
    }

    return rocks;
  }
}
