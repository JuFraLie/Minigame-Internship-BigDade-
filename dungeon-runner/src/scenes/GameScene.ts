// GameScene.ts — gameplay (template `Game`).
// Drives the headless Game controller each frame and draws the world through
// read-only views. On death it hands over to the Result Panel scene.
// Retry from the Result Panel lands HERE directly — never on the Play
// Screen (§2).

import { Scene } from 'phaser';
import { VIEWPORT } from '../config/gameConfig.ts';
import { WorldView } from '../render/worldView.ts';
import type { SceneDeps } from './deps.ts';
import { forwardPointerInput } from './pointerFeed.ts';

export class GameScene extends Scene {
  private readonly deps: SceneDeps;
  private world!: WorldView;

  constructor(deps: SceneDeps) {
    super('Game');
    this.deps = deps;
  }

  create(): void {
    const { game, layout, feed } = this.deps;
    // Gestures during a run: tap = jump, swipe down = shield (via the shared
    // adapters; Phaser's pointer events are the only input path).
    forwardPointerInput(this, feed);
    this.world = new WorldView(this, layout);
    this.world.update(game, 0);
  }

  update(_time: number, delta: number): void {
    const { game, actions, pointer } = this.deps;
    const dt = Math.min(delta / 1000, VIEWPORT.MAX_DT);

    game.update(dt, actions, pointer);
    this.world.update(game, dt);

    if (game.state === 'dead') {
      // The round's end condition was reached → Result Panel (§2).
      this.scene.start('GameOver');
    }
  }
}
