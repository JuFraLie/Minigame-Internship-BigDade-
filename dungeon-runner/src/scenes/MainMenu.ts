// MainMenu.ts — the Play Screen (template `MainMenu`).
// Shows the title, a real Play button and how-to lines. Tapping
// ANYWHERE on this screen starts the game (§2): the tap flows through the
// PointerSource port into the Game controller, which fires `launch` (once)
// and starts the first round.

import { Scene } from 'phaser';
import { VIEWPORT } from '../config/gameConfig.ts';
import { DungeonBackground } from '../render/background.ts';
import { KnightView } from '../render/knightView.ts';
import { StartScreenView } from '../render/screens.ts';
import type { SceneDeps } from './deps.ts';
import { forwardPointerInput } from './pointerFeed.ts';

export class MainMenu extends Scene {
  private readonly deps: SceneDeps;
  private background!: DungeonBackground;
  private knight!: KnightView;
  private screen!: StartScreenView;

  constructor(deps: SceneDeps) {
    super('MainMenu');
    this.deps = deps;
  }

  create(): void {
    const { layout, game, feed } = this.deps;
    forwardPointerInput(this, feed);
    this.background = new DungeonBackground(this, layout);
    this.knight = new KnightView(this);
    this.screen = new StartScreenView(this, layout);

    this.background.update(game.viewSpeed, 0);
    this.knight.update(game.knight);
    this.screen.update(game.titlePulse);
  }

  update(_time: number, delta: number): void {
    const { game, actions, pointer } = this.deps;
    const dt = Math.min(delta / 1000, VIEWPORT.MAX_DT);

    game.update(dt, actions, pointer);

    this.background.update(game.viewSpeed, dt);
    this.knight.update(game.knight);
    this.screen.update(game.titlePulse);

    if (game.state !== 'start') {
      // Discard the tap that started the run so the knight doesn't jump
      // on the very first frame of the round (plus the runAge gate inside).
      actions.consume();
      this.scene.start('Game');
    }
  }
}
