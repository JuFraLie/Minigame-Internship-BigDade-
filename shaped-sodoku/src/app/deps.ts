import type Phaser from 'phaser';

import type { BridgePort, SessionPort, ClockPort, ViewportPort } from '../domain/ports.ts';
import type { GameLayout } from '../render/GameLayout.ts';
import type { RenderPort } from '../render/RenderPort.ts';
import type { InputPort } from '../input/InputAdapter.ts';

/**
 * What the composition root hands to every scene.
 *
 * Scenes consume only these contracts — never `PhaserCanvasRenderer`, never `InputAdapter`.
 * The two factories are where wiring happens: `src/app/composition.ts` decides which
 * concrete implementations exist, and the scene simply calls a function typed as a port.
 * That is what keeps a scene replaceable, testable and runnable without a renderer.
 */
export interface AppDeps {
    readonly bridge: BridgePort;
    readonly session: SessionPort;
    readonly clock: ClockPort;
    readonly viewport: ViewportPort;
    /** Builds the renderer for a scene. The scene only ever sees `RenderPort`. */
    readonly createRenderer: (scene: Phaser.Scene) => RenderPort;
    /** Builds the input adapter, fed by whatever layout the scene currently holds. */
    readonly createInput: (layoutOf: () => GameLayout | null) => InputPort;
}
