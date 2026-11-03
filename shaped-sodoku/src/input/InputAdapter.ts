import type { GameCommand } from '../domain/ports.ts';
import type { GameLayout } from '../render/GameLayout.ts';
import { hitTest } from '../render/GameLayout.ts';

/**
 * The only place screen coordinates are interpreted.
 *
 * Everything downstream of this file speaks puzzle coordinates. Per the architecture
 * rules, a tap on the canvas is converted into a `{row, col}` or `{shape}` command before
 * it is allowed anywhere near game logic — so the domain can be exercised, and
 * benchmarked, with no renderer and no viewport at all.
 */
export interface InputPort {
    /** Maps a design-space tap to a command, or `null` when the tap means nothing. */
    pick(x: number, y: number): GameCommand | null;
}

/**
 * Reads the layout lazily rather than holding one, so a viewport change is picked up
 * without the adapter having to be rebuilt.
 */
export class InputAdapter implements InputPort {
    readonly #layoutOf: () => GameLayout | null;

    constructor(layoutOf: () => GameLayout | null) {
        this.#layoutOf = layoutOf;
    }

    pick(x: number, y: number): GameCommand | null {
        const layout = this.#layoutOf();
        if (!layout) return null;
        return hitTest(layout, x, y);
    }
}
