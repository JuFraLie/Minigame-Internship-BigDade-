// GameOverScene.ts — the Result Panel (template `GameOver`).
// Appears when the round ends: reports `endRound { win: true, score }` to the
// host (§4.2, idempotent — die() already reported), shows the final score and
// offers Restart / Exit — the ONLY place those actions exist (§2). Restart
// jumps straight back into gameplay.

import { Scene } from 'phaser';
import { VIEWPORT } from '../config/gameConfig.ts';
import { ResultPanelView } from '../render/screens.ts';
import { WorldView } from '../render/worldView.ts';
import type { SceneDeps } from './deps.ts';
import { forwardPointerInput } from './pointerFeed.ts';

export class GameOverScene extends Scene {
  private readonly deps: SceneDeps;
  private world!: WorldView;
  private panel!: ResultPanelView;

  constructor(deps: SceneDeps) {
    super('GameOver');
    this.deps = deps;
  }

  create(): void {
    const { game, layout, feed } = this.deps;

    forwardPointerInput(this, feed);

    // The Result Panel is appearing → finalize the round for the host.
    // Endless game → win is always true (§4.2). Safe to call twice.
    game.reportResult();

    this.world = new WorldView(this, layout);
    this.panel = new ResultPanelView(this, layout);
    this.world.update(game, 0);
    this.panel.update(game.score, game.hiScore, game.isNewHi);
  }

  update(_time: number, delta: number): void {
    const { game, actions, pointer } = this.deps;
    const dt = Math.min(delta / 1000, VIEWPORT.MAX_DT);

    // Consumes taps: Restart → new round, Exit → bridge exit (at most once).
    game.update(dt, actions, pointer);

    this.world.update(game, dt);
    this.panel.update(game.score, game.hiScore, game.isNewHi);

    if (game.state === 'playing') {
      // Retry goes straight back to gameplay (§2).
      actions.consume();
      this.scene.start('Game');
    }
  }
}
