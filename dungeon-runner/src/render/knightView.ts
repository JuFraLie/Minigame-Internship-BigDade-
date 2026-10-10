// knightView.ts — knight sprite drawing.
// Reads the Knight simulation's state and frame; mutates nothing. The
// animation clock lives on the entity and is ticked by the simulation.

import type { Knight } from '../game/knight.ts';
import { SHEET_KEYS } from './spriteSheets.ts';

export class KnightView {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(0, 0, SHEET_KEYS.running, 0).setOrigin(0, 0).setDepth(10);
  }

  update(knight: Knight): void {
    // Flicker while invulnerable (damage i-frames): blink the sprite.
    this.sprite.setVisible(!(knight.isInvulnerable && Math.floor(knight.invulnerableTimer * 20) % 2 === 0));

    const key = SHEET_KEYS[knight.state];
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    if (String(this.sprite.frame.name) !== String(knight.frame)) this.sprite.setFrame(knight.frame);
    this.sprite.setDisplaySize(knight.displayW, knight.displayH);
    this.sprite.setPosition(Math.round(knight.x), Math.round(knight.y));
  }
}
