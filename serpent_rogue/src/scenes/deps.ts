// deps.ts — what a screen is allowed to reach for.
//
// Scenes are handed this bundle by the composition root (src/main.ts); they
// never construct the rules engine, the viewport or the audio synth themselves
// (AGENTS.md §4.3: wiring happens outside the components that use it).

import type { Game } from '../game/game.ts';
import type { Viewport } from '../render/viewport.ts';

export interface SceneDeps {
  /** The headless rules engine — one instance for the whole session. */
  readonly game: Game;
  /** Playfield geometry; also the engine's `Layout` port. */
  readonly viewport: Viewport;
  /** Unlocks procedural audio from the first user gesture (mobile WebViews). */
  readonly unlockAudio: () => void;
}
