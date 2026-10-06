// GameOver — the Result Panel (AGENTS.md §2).
//
// Appears only once a round has ended, and it is the only place Restart and
// Exit exist. Taps are converted to playfield coordinates and handed to the
// controller, which owns both actions: Restart goes straight back to gameplay
// (the Play Screen does not replay) and Exit fires the bridge's exit signal
// exactly once and nothing else.

import Phaser from 'phaser';
import { VIEWPORT } from '../config/gameConfig.ts';
import { PlayerInput } from '../input/playerInput.ts';
import { ResultView } from '../render/resultView.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../render/viewport.ts';
import type { SceneDeps } from './deps.ts';

export class GameOver extends Phaser.Scene {
  private readonly deps: SceneDeps;
  private controls!: PlayerInput;
  private result!: ResultView;

  constructor(deps: SceneDeps) {
    super('GameOver');
    this.deps = deps;
  }

  create(): void {
    applyRenderScale(this);
    this.controls = new PlayerInput(this, this.deps.viewport);
    this.build();

    this.game.events.on(VIEWPORT_CHANGED, this.rebuild, this);
    this.events.once('shutdown', this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    const { game } = this.deps;
    const dt = Math.min(delta / 1000, VIEWPORT.MAX_DT);

    // Only ever advanced while the round is finalized: the controller consumes
    // the tap for the panel's buttons and leaves the run untouched otherwise.
    if (game.state === 'dead') {
      // A stray key press here is drained and dropped by the controller: the
      // round is over, so no turn can leak into the next one.
      game.update(dt, this.controls.direction, this.controls.taps);
    }

    // A tap on Restart has put the controller back in 'playing'; hand over
    // straight to gameplay (AGENTS.md §2 — no Play Screen replay). Exit leaves
    // the state alone: tearing the session down is the host's job.
    if (game.state === 'playing') {
      this.scene.start('Game');
    }
  }

  private build(): void {
    this.result = new ResultView(this, this.deps.viewport);
    this.result.render(this.deps.game);
  }

  private rebuild(): void {
    applyRenderScale(this);
    this.result.destroy();
    this.build();
  }

  private onShutdown(): void {
    this.game.events.off(VIEWPORT_CHANGED, this.rebuild, this);
  }
}
