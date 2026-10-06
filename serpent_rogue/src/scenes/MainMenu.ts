// MainMenu — the Play Screen (AGENTS.md §2).
//
// Shows the title and a PLAY button, and tapping anywhere on the screen starts
// the run: the tap is handed to the rules engine, which fires the bridge's
// `launch` signal exactly once and opens the round, and the scene then hands
// control to the Game scene. The screen only ever draws and forwards — every
// rule stays in src/game.

import Phaser from 'phaser';
import { VIEWPORT } from '../config/gameConfig.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../render/viewport.ts';
import { MenuView } from '../render/menuView.ts';
import { WorldView } from '../render/worldView.ts';
import { NONE_DIRECTION, NONE_TAP } from '../input/inputBuffer.ts';
import type { SceneDeps } from './deps.ts';

export class MainMenu extends Phaser.Scene {
  private readonly deps: SceneDeps;
  private world!: WorldView;
  private menu!: MenuView;
  private starting = false;

  constructor(deps: SceneDeps) {
    super('MainMenu');
    this.deps = deps;
  }

  create(): void {
    applyRenderScale(this);
    // A field outlives the scene's shutdown: if this screen is ever built a
    // second time, a stale guard would swallow every tap and dead-end the Play
    // Screen (AGENTS.md §2 requires tap-anywhere to start).
    this.starting = false;
    this.build();

    // Tap anywhere starts the run (AGENTS.md §2). A desktop has no glass to
    // tap, so any key starts it too — the keyboard equivalent of the same
    // deliberate press, and no key is bound to gameplay here.
    this.input.on('pointerdown', this.onStart, this);
    this.input.keyboard?.on('keydown', this.onStart, this);
    this.game.events.on(VIEWPORT_CHANGED, this.rebuild, this);
    this.events.once('shutdown', this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    // The handler above already queued the hand-off to the Game scene; nothing
    // to advance on the way out.
    if (this.deps.game.state !== 'start') return;

    const dt = Math.min(delta / 1000, VIEWPORT.MAX_DT);
    // Advances the title pulse only: no tap source, so the run cannot start
    // from here twice.
    this.deps.game.update(dt, NONE_DIRECTION, NONE_TAP);
    this.menu.draw(this.deps.game.titlePulse);
  }

  /** Builds (or rebuilds after a resize) the Play Screen layers. */
  private build(): void {
    const { viewport } = this.deps;
    // The playfield sits under the overlay, so the Play Screen reads as the game
    // paused behind it rather than a separate poster.
    this.world = new WorldView(this, viewport);
    this.world.render(this.deps.game);
    this.menu = new MenuView(this, viewport);
  }

  private rebuild(): void {
    applyRenderScale(this);
    this.world.destroy();
    this.menu.destroy();
    this.build();
    this.menu.draw(this.deps.game.titlePulse);
  }

  private onStart(): void {
    if (this.starting) return;
    this.starting = true;

    this.deps.unlockAudio();

    // The engine ignores this unless the run has not started yet, so a double
    // tap cannot launch twice (AGENTS.md §4.2).
    this.deps.game.handleAnyInput();

    if (this.deps.game.state !== 'start') {
      this.scene.start('Game');
    } else {
      this.starting = false;
    }
  }

  private onShutdown(): void {
    this.game.events.off(VIEWPORT_CHANGED, this.rebuild, this);
    this.input.off('pointerdown', this.onStart, this);
    this.input.keyboard?.off('keydown', this.onStart, this);
  }
}
