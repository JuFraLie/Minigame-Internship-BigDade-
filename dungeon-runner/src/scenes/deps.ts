// deps.ts — the surface a scene receives from the composition root.
// Scenes consume ports only; wiring of concrete implementations happens in
// bootstrap.ts and nowhere else (§4.3).

import type { ActionSource, Layout, PointerFeed, PointerSource } from '../core/types.ts';
import type { Game } from '../game/game.ts';

export interface SceneDeps {
  /** Edge-to-edge world geometry (any vertical screen height, §3.1). */
  layout: Layout;
  /** The headless simulation + rules. */
  game: Game;
  /** Touch actions (jump / shield) in game semantics. */
  actions: ActionSource;
  /** Raw taps, already in game-world coordinates (§4.3). */
  pointer: PointerSource;
  /** Screen-space pointer feed: scenes forward Phaser's pointer events here
   *  so the adapters above can translate them (§4.3 — Phaser stays in the
   *  render layer, game logic never sees it). */
  feed: PointerFeed;
}
