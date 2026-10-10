// Preloader.ts — template Preloader scene: loads the knight + boss sprites
// with a progress bar, strips the knight sheets' white backgrounds into
// spritesheets, then moves on to the Play Screen.

import { Scene } from 'phaser';
import { installSheets, loadSheets } from '../render/spriteSheets.ts';
import type { SceneDeps } from './deps.ts';

export class Preloader extends Scene {
  private readonly deps: SceneDeps;

  constructor(deps: SceneDeps) {
    super('Preloader');
    this.deps = deps;
  }

  init(): void {
    const gw = this.deps.layout.gameW;
    const gh = this.deps.layout.gameH;
    const cx = gw / 2;
    const cy = gh / 2;
    const barW = Math.round(gw * 0.6);

    this.add.rectangle(cx, cy, barW, 32).setStrokeStyle(1, 0xffffff);
    const bar = this.add.rectangle(cx - barW / 2 + 2, cy, 4, 28, 0xffffff).setOrigin(0, 0.5);

    this.load.on('progress', (progress: number) => {
      bar.width = Math.max(4, (barW - 8) * progress + 4);
    });
  }

  preload(): void {
    loadSheets(this.load);
  }

  create(): void {
    installSheets(this.textures);
    this.scene.start('MainMenu');
  }
}
