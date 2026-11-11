import type { Vec2 } from '../../domain/types.ts';

/**
 * The view transform: world units (tiles) <-> design-space screen units.
 *
 * The renderer uses it to place enemies, towers and projectiles; the input adapter uses
 * its inverse to turn a tap back into world coordinates before anything reaches game
 * logic. That direction of travel is a rule (AGENTS.md §4.3): game logic never sees a
 * pixel position.
 */
export interface ViewTransform {
    readonly tile: number;
    readonly originX: number;
    readonly originY: number;
    toScreenX(worldX: number): number;
    toScreenY(worldY: number): number;
    toWorldX(screenX: number): number;
    toWorldY(screenY: number): number;
}

export interface BoardRect {
    readonly x: number;
    readonly y: number;
    readonly tile: number;
}

export function createViewTransform(board: BoardRect): ViewTransform {
    return {
        tile: board.tile,
        originX: board.x,
        originY: board.y,
        toScreenX: (worldX: number) => board.x + worldX * board.tile,
        toScreenY: (worldY: number) => board.y + worldY * board.tile,
        toWorldX: (screenX: number) => (screenX - board.x) / board.tile,
        toWorldY: (screenY: number) => (screenY - board.y) / board.tile,
    };
}

/** Writes the screen position of a world point into `out` and returns it. */
export function worldToScreen(transform: ViewTransform, point: Vec2, out: Vec2): Vec2 {
    out.x = transform.toScreenX(point.x);
    out.y = transform.toScreenY(point.y);
    return out;
}
