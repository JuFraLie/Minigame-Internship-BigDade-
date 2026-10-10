// worldView.ts — composes the world layer for a scene: background, boss,
// pickups, obstacles, warnings, knight, HUD. Reads game state only; views
// never mutate the simulation. Game logic itself stays headless (§4.3) —
// this is just one possible view.

import type { Layout } from '../core/types.ts';
import type { Game } from '../game/game.ts';
import { DungeonBackground } from './background.ts';
import { BossView } from './bossView.ts';
import { Hud } from './hud.ts';
import { KnightView } from './knightView.ts';
import { ObstacleView } from './obstacleView.ts';
import { PickupView } from './pickupView.ts';
import { dangerMarkers, WarningView } from './warningView.ts';

export class WorldView {
  private readonly layout: Layout;
  private readonly background: DungeonBackground;
  private readonly boss: BossView;
  private readonly pickups: PickupView;
  private readonly obstacles: ObstacleView;
  private readonly warnings: WarningView;
  private readonly knight: KnightView;
  private readonly hud: Hud;

  constructor(scene: Phaser.Scene, layout: Layout) {
    this.layout = layout;
    this.background = new DungeonBackground(scene, layout);
    this.boss = new BossView(scene);
    this.pickups = new PickupView(scene);
    this.obstacles = new ObstacleView(scene);
    this.warnings = new WarningView(scene);
    this.knight = new KnightView(scene);
    this.hud = new Hud(scene, layout);
  }

  update(game: Game, dt: number): void {
    const floorY = this.layout.floorY();
    this.background.update(game.viewSpeed, dt);
    this.boss.update(game.boss, floorY);
    this.pickups.update(game.pickupSpawner.pickups);
    this.obstacles.update(game.spawner.obstacles, floorY);
    if (game.state === 'playing') {
      this.warnings.update(
        dangerMarkers(game.spawner.obstacles, this.layout.gameW, floorY, game.viewSpeed),
        dt,
        this.layout.gameW,
      );
    } else {
      this.warnings.update([], dt, this.layout.gameW);
    }
    this.knight.update(game.knight);
    this.hud.update(game.score, game.hiScore, game.hearts, game.maxHearts, game.coins);
  }
}
