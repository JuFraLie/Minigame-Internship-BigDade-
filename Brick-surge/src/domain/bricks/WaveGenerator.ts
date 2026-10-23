/**
 * Wave layout generation: small pattern templates (rows, pyramid, checker,
 * gaps) filled with bricks, with the Tough/Sturdy share scaled by the DDA.
 *
 * Pure and deterministic for a given RandomPort sequence — tests drive it
 * with a seeded RNG.
 */

import { BRICK_COLS, BRICK_GAP, BRICK_H, BRICK_TOP_FRAC, BRICK_W, BRICK_POINTS, BRICK_HP, MAX_BRICKS, WORLD_WIDTH } from '../config.ts';
import type { RandomPort } from '../ports.ts';
import type { Brick, BrickKind } from '../types.ts';

/** How many rows each wave has (clamped so a wave never exceeds MAX_BRICKS).
 *  Ballz-pace: short waves keep a round near the 2-3 minute target and never
 *  bury the player in bricks. */
const WAVE_ROWS = [2, 3, 3];

/** Base share of non-basic bricks per wave (before the DDA multiplier). */
const BASE_TOUGH_SHARE = 0.08;
const BASE_STURDY_SHARE = 0.15;

type TemplateName = 'rows' | 'pyramid' | 'checker' | 'gaps';

/**
 * Decide which cells of a rows x cols grid hold a brick, per template.
 * Returns a boolean grid (row-major).
 */
function buildGrid(template: TemplateName, rows: number, cols: number, random: RandomPort): boolean[][] {
    const grid: boolean[][] = [];
    for (let r = 0; r < rows; r++) grid.push(new Array<boolean>(cols).fill(true));

    switch (template) {
        case 'rows':
            break;
        case 'pyramid':
            // Each row narrower and centred — top rows keep only the middle.
            for (let r = 0; r < rows; r++) {
                const shrink = Math.floor(r * (cols / (rows * 1.6)));
                for (let c = 0; c < cols; c++) {
                    if (c < shrink || c >= cols - shrink) grid[r][c] = false;
                }
            }
            break;
        case 'checker':
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if ((r + c) % 2 === 1) grid[r][c] = false;
                }
            }
            break;
        case 'gaps':
            // Full grid with a few random holes.
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (random.next() < 0.18) grid[r][c] = false;
                }
            }
            break;
    }
    return grid;
}

export class WaveGenerator {
    private readonly random: RandomPort;

    constructor(random: RandomPort) {
        this.random = random;
    }

    /**
     * Generate the brick layout for a wave (1-based).
     * `toughShareMul` scales the Tough+Sturdy share (0.7 .. 1.3 from the DDA);
     * the split between Tough and Sturdy keeps its base ratio. Tough bricks
     * only appear from wave 2 (§5).
     */
    generate(wave: number, worldHeight: number, toughShareMul: number): Brick[] {
        const rows = WAVE_ROWS[Math.min(wave, WAVE_ROWS.length) - 1];
        const template = this.pickTemplate();
        const grid = buildGrid(template, rows, BRICK_COLS, this.random);

        const top = worldHeight * BRICK_TOP_FRAC;
        const left = (WORLD_WIDTH - (BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP)) / 2;

        // Mix: scale non-basic share, keep the Tough:Sturdy ratio ~1:2.
        const nonBasicShare = Math.min(0.9, (BASE_TOUGH_SHARE + BASE_STURDY_SHARE) * toughShareMul);
        const toughShare = wave >= 2 ? nonBasicShare * 0.3 : 0;
        const sturdyShare = nonBasicShare * 0.7;

        const bricks: Brick[] = [];
        let id = 1;
        for (let r = 0; r < rows && bricks.length < MAX_BRICKS; r++) {
            for (let c = 0; c < BRICK_COLS && bricks.length < MAX_BRICKS; c++) {
                if (!grid[r][c]) continue;
                const kind = this.pickKind(toughShare, sturdyShare);
                bricks.push({
                    id: id++,
                    kind,
                    x: left + c * (BRICK_W + BRICK_GAP) + BRICK_W / 2,
                    y: top + r * (BRICK_H + BRICK_GAP) + BRICK_H / 2,
                    w: BRICK_W,
                    h: BRICK_H,
                    hp: BRICK_HP[kind],
                    maxHp: BRICK_HP[kind],
                });
            }
        }
        return bricks;
    }

    private pickTemplate(): TemplateName {
        const roll = this.random.next();
        if (roll < 0.3) return 'rows';
        if (roll < 0.55) return 'pyramid';
        if (roll < 0.8) return 'checker';
        return 'gaps';
    }

    private pickKind(toughShare: number, sturdyShare: number): BrickKind {
        const roll = this.random.next();
        if (roll < toughShare) return 'tough';
        if (roll < toughShare + sturdyShare) return 'sturdy';
        return 'basic';
    }
}

/** Points a brick of the given kind is worth (before the combo multiplier). */
export const brickPoints = (kind: BrickKind): number => BRICK_POINTS[kind];
