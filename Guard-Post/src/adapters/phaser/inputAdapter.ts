import { TOWER_TYPES, type TowerType, type TowerView, type Vec2 } from '../../domain/types.ts';
import { MIN_TAP, hitRect, type PlayLayout } from './layout.ts';
import type { ViewTransform } from './viewTransform.ts';

/**
 * The only place screen coordinates are interpreted.
 *
 * A tap arrives in design-space pixels, is converted back into world units by the view
 * transform, and is then hit-tested against world-space spots and towers. Everything
 * downstream of this file speaks world coordinates and ids, so game logic can be
 * exercised and benchmarked with no renderer and no viewport at all.
 *
 * No Phaser import: the adapter is pure arithmetic over a lazily supplied context, which
 * is what lets tests drive it directly.
 */

/** What the player has selected on the board, if anything. */
export type Selection = { readonly kind: 'spot'; readonly spotId: number } | { readonly kind: 'tower'; readonly towerId: number };

/** Everything a tap can mean on the play screen. */
export type PlayAction =
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' }
    | { readonly kind: 'callWave' }
    | { readonly kind: 'toggleSpeed' }
    | { readonly kind: 'selectSpot'; readonly spotId: number }
    | { readonly kind: 'selectTower'; readonly towerId: number }
    | { readonly kind: 'clearSelection' }
    | { readonly kind: 'build'; readonly tower: TowerType }
    | { readonly kind: 'upgrade' }
    | { readonly kind: 'sell' };

/** What the adapter needs to know about the current frame, supplied by the scene. */
export interface PlayContext {
    readonly layout: PlayLayout;
    readonly transform: ViewTransform;
    /** The map's build spots in world units. */
    readonly spots: readonly Vec2[];
    /** Live towers from the round snapshot. */
    readonly towers: readonly TowerView[];
    readonly selection: Selection | null;
    /** The Call wave button is up (grace period or wave gap). */
    readonly canCallWave: boolean;
    /** The pause overlay is showing. */
    readonly paused: boolean;
}

export interface InputPort {
    /** Maps a design-space tap to an action, or `null` when the tap means nothing. */
    pick(x: number, y: number): PlayAction | null;
}

/**
 * Tap acceptance half-side around a spot or tower, in world units: a box, matching the
 * square pads. Exported so tests can reason about the tap target.
 */
export function pickHalfSide(tile: number): number {
    // At least a 44 px box, but never so wide that neighbouring pads overlap.
    return Math.min(Math.max(MIN_TAP / (2 * tile), 0.45), 0.9);
}

function spotAt(context: PlayContext, worldX: number, worldY: number): number {
    const half = pickHalfSide(context.layout.board.tile);
    for (let id = 0; id < context.spots.length; id++) {
        const spot = context.spots[id];
        if (Math.abs(spot.x - worldX) <= half && Math.abs(spot.y - worldY) <= half) return id;
    }
    return -1;
}

function towerAt(context: PlayContext, worldX: number, worldY: number): TowerView | null {
    const half = pickHalfSide(context.layout.board.tile);
    for (const tower of context.towers) {
        if (Math.abs(tower.x - worldX) <= half && Math.abs(tower.y - worldY) <= half) return tower;
    }
    return null;
}

/** Resolves a design-space tap against a context. Exported so tests can drive it raw. */
export function pickAction(context: PlayContext, x: number, y: number): PlayAction | null {
    const layout = context.layout;

    // Pause overlay: Resume is the only thing on screen that answers to a tap.
    if (context.paused) return hitRect(layout.resume, x, y) ? { kind: 'resume' } : null;

    if (hitRect(layout.hud.pause, x, y)) return { kind: 'pause' };

    // Open menus claim their own buttons first…
    if (context.selection?.kind === 'spot') {
        for (let index = 0; index < layout.menu.buildButtons.length; index++) {
            if (hitRect(layout.menu.buildButtons[index], x, y)) {
                return { kind: 'build', tower: TOWER_TYPES[index] ?? TOWER_TYPES[0] };
            }
        }
    }
    if (context.selection?.kind === 'tower') {
        const [upgrade, sell] = layout.menu.towerButtons;
        if (upgrade && hitRect(upgrade, x, y)) return { kind: 'upgrade' };
        if (sell && hitRect(sell, x, y)) return { kind: 'sell' };
    }

    // …and a tap on the menu's own background closes nothing: it is dead space.
    if (context.selection && hitRect(layout.menu.panel, x, y)) return null;

    // The speed boost is always available during play, even between waves.
    if (hitRect(layout.speed, x, y)) return { kind: 'toggleSpeed' };

    if (context.canCallWave && hitRect(layout.callWave, x, y)) return { kind: 'callWave' };

    const board = layout.board;
    const onBoard = x >= board.x && x <= board.x + board.width && y >= board.y && y <= board.y + board.height;
    if (!onBoard) return null;

    const worldX = context.transform.toWorldX(x);
    const worldY = context.transform.toWorldY(y);

    // A tower stands on its spot, so the tower wins the shared tap.
    const tower = towerAt(context, worldX, worldY);
    if (tower) return { kind: 'selectTower', towerId: tower.id };

    const spotId = spotAt(context, worldX, worldY);
    if (spotId >= 0) return { kind: 'selectSpot', spotId };

    // Empty board area: closes whatever menu is open (AGENTS.md §4 controls table).
    return { kind: 'clearSelection' };
}

/** Reads the adapter lazily, so a resize is picked up without rebuilding it. */
export class InputAdapter implements InputPort {
    readonly #contextOf: () => PlayContext | null;

    constructor(contextOf: () => PlayContext | null) {
        this.#contextOf = contextOf;
    }

    pick(x: number, y: number): PlayAction | null {
        const context = this.#contextOf();
        if (!context) return null;
        return pickAction(context, x, y);
    }
}
