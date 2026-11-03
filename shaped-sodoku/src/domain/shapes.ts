/**
 * Shape identity, and nothing else.
 *
 * The domain only ever learns that shapes are distinct tokens and how many of them a grid
 * holds. That a Circle is coral, or that a Star has five points, belongs to the render
 * layer (`src/render/palette.ts`). Keeping identity numeric is what lets rules, generation
 * and scoring stay free of presentation data — and what makes a headless run possible.
 */

/** Most distinct shapes any grid in this game uses (the 6×6 levels use all of them). */
export const MAX_SHAPES = 6;

/**
 * An opaque shape token in the range `[0, shapeCount)`.
 *
 * A grid of size N plays with exactly the shapes `0 … N-1`, each appearing once per row,
 * per column and per box.
 */
export type ShapeId = number;

/** True when `value` is an integer a grid of `shapeCount` shapes could hold. */
export function isShapeId(value: unknown, shapeCount: number): value is ShapeId {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < shapeCount;
}
