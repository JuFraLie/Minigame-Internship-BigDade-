// Boot.ts — template Boot scene. Loads nothing heavy and hands over to the
// Preloader. It exists to keep the template's scene pipeline intact (§4.1).

import { Scene } from 'phaser';

export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Preloader');
  }
}
