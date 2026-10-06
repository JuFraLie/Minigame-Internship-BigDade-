// Game — the gameplay scene: one frame = one simulation step + one repaint.
//
// The scene owns no rules. It feeds the engine's input ports (swipes, taps,
// dash) from the adapter, lets the headless controller advance, and mirrors the
// result into three views: the playfield, the HUD, and the level-up overlay.
// When the run ends the controller has already reported `endRound`, so the
// scene only hands over to the Result Panel (AGENTS.md §2, §4.3).

import Phaser from 'phaser';
import { VIEWPORT } from '../config/gameConfig.ts';
import { PlayerInput } from '../input/playerInput.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../render/viewport.ts';
import { HudView } from '../render/hudView.ts';
import { UpgradeView } from '../render/upgradeView.ts';
import { WorldView } from '../render/worldView.ts';
import type { SceneDeps } from './deps.ts';

export class GameScene extends Phaser.Scene {
  private readonly deps: SceneDeps;
  private controls!: PlayerInput;
  private world!: WorldView;
  private hud!: HudView;
  private upgrade!: UpgradeView;
  private finishing = false;

  constructor(deps: SceneDeps) {
    super('Game');
    this.deps = deps;
  }

  create(): void {
    applyRenderScale(this);
    // `create` runs again on every retry, but the fields survive the scene's
    // shutdown: without this reset the flag from the previous death would block
    // the next hand-off and the Result Panel would never reappear.
    this.finishing = false;
    this.controls = new PlayerInput(this, this.deps.viewport);
    this.build();

    this.game.events.on(VIEWPORT_CHANGED, this.rebuild, this);
    this.events.once('shutdown', this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    const { game } = this.deps;
    const dt = Math.min(delta / 1000, VIEWPORT.MAX_DT);

    // A queued hand-off can arrive with the run already finalized; never feed
    // the controller another frame then, or a gameplay tap could reach the
    // Result Panel's buttons.
    if (game.state !== 'dead') {
      game.update(dt, this.controls.direction, this.controls.taps, this.controls.consumeDash());

      this.world.render(game);
      this.hud.render(game);
      this.upgrade.sync(game);
    }

    // The controller has already reported `endRound` by now: hand over.
    if (game.state === 'dead') this.toResultPanel();
  }

  private build(): void {
    const { viewport, game } = this.deps;
    this.world = new WorldView(this, viewport);
    this.hud = new HudView(this, viewport);
    this.upgrade = new UpgradeView(this, viewport);

    this.world.render(game);
    this.hud.render(game);
    this.upgrade.sync(game);
  }

  private rebuild(): void {
    applyRenderScale(this);
    this.world.destroy();
    this.hud.destroy();
    this.upgrade.destroy();
    this.build();
  }

  private toResultPanel(): void {
    if (this.finishing) return;
    this.finishing = true;
    this.scene.start('GameOver');
  }

  private onShutdown(): void {
    this.game.events.off(VIEWPORT_CHANGED, this.rebuild, this);
  }
}
