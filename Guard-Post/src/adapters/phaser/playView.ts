import type { GameMap } from '../../domain/maps.ts';
import type { RoundEvent, RoundSnapshot } from '../../domain/types.ts';
import type { Selection } from './inputAdapter.ts';
import type { PlayLayout } from './layout.ts';
import type { GameSpeed } from './speed.ts';

/**
 * The renderer contract of the play screen — the `GameViewPort` of the design document,
 * declared next to the renderer it describes (the same way the template's `RenderPort`
 * sits with its implementation) so that importing it never drags Phaser along.
 *
 * Scenes consume only this interface; the concrete `PhaserCanvasRenderer` is constructed
 * once, in the composition root, and nowhere else.
 */

/** The UI state the scene asks the renderer to draw, alongside the round itself. */
export interface PlayUiState {
    readonly selection: Selection | null;
    readonly paused: boolean;
    /** Current presentation speed: 1x or the 2x boost. */
    readonly speed: GameSpeed;
}

export interface GameViewPort {
    /** Builds every object the screen needs for a round. */
    create(layout: PlayLayout, map: GameMap): void;
    /** Draws one frame: the snapshot first, then the events earned since the last call. */
    present(snapshot: RoundSnapshot, events: readonly RoundEvent[], ui: PlayUiState, alpha: number): void;
    /** Re-lays the screen out after a resize. */
    relayout(layout: PlayLayout): void;
    /** Drops everything drawn for the current round. */
    destroy(): void;
}
