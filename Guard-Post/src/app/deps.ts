import type Phaser from 'phaser';

import type { InputPort, PlayContext } from '../adapters/phaser/inputAdapter.ts';
import type { GameViewPort } from '../adapters/phaser/playView.ts';
import type { CreditPort, ViewportPort } from './ports.ts';
import type { SessionFlow } from './sessionFlow.ts';

/**
 * What the composition root hands to every scene.
 *
 * Scenes consume only these contracts — never `PhaserCanvasRenderer`, never
 * `InputAdapter`. The two factories are where wiring happens: `src/composition.ts`
 * decides which concrete implementations exist, and a scene simply calls a function
 * typed as a port. That is what keeps a scene replaceable and runnable without a
 * renderer.
 */
export interface AppDeps {
    /** The screen-flow state machine; the scenes tell it what happened. */
    readonly flow: SessionFlow;
    /** The live viewport, for layout math. */
    readonly viewport: ViewportPort;
    /** The Play Screen's credit line: a label, and what a tap on it does. */
    readonly credit: CreditPort;
    /** Builds the renderer for a scene. The scene only ever sees `GameViewPort`. */
    readonly createView: (scene: Phaser.Scene) => GameViewPort;
    /** Builds the input adapter, fed by whatever context the scene currently holds. */
    readonly createInput: (contextOf: () => PlayContext | null) => InputPort;
}
