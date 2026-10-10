// bossView.ts — draws the chaser from Boss state.
//
// The sheet is a strip of BOSS.FRAMES equal cells, but the demon drifts
// sideways inside his cell and his width changes with the gait, so slicing
// naively would make him jitter frame to frame. At first update the opaque
// content box of every cell is measured instead: frames are drawn
// content-centred in the Boss box (only the gait sways), with a uniform scale
// (no distortion) and the feet on the floor line.

import { BOSS } from '../config/gameConfig.ts';
import type { Boss } from '../game/boss.ts';
import { BOSS_KEY } from './spriteSheets.ts';

interface FrameBox {
  sx: number;
  sw: number;
}

export class BossView {
  private readonly img: Phaser.GameObjects.Image;
  private readonly fallback: Phaser.GameObjects.Graphics;
  private frames: FrameBox[] = [];
  private contentH = 0;
  private sheetH = 0;
  private measured = false;

  constructor(scene: Phaser.Scene) {
    this.img = scene.add.image(0, 0, BOSS_KEY).setOrigin(1, 0).setDepth(2);
    // Blade reaches RIGHT, toward the knight.
    this.img.setFlipX(true);
    this.img.setVisible(false);
    this.fallback = scene.add.graphics().setDepth(2);
  }

  update(boss: Boss, floorY: number): void {
    if (!this.measured) this.measure();

    if (!this.measured || this.frames.length === 0) {
      // Placeholder block until the sprite finishes loading.
      this.fallback.clear();
      this.fallback.fillStyle(0x8b0000, 1);
      this.fallback.fillRect(boss.x, floorY - boss.H, boss.W, boss.H);
      return;
    }
    this.fallback.clear();
    this.img.setVisible(true);

    const frame = this.frames[boss.frame] ?? this.frames[0];
    const scale = boss.H / this.sheetH;
    const dw = frame.sw * scale;
    const dh = this.contentH * scale;
    const dx = boss.x + (boss.W - dw) / 2;
    const dy = floorY - dh;

    // The cell is a real texture frame installed by measure() — NOT a crop.
    // `setDisplaySize` derives the scale from `frame.realWidth`, which is the
    // WHOLE sheet, so cropping would shrink the demon to a few pixels and push
    // him off the left edge; with his own frame the scale applies to the
    // content box only, exactly like the knight's sheets.
    if (String(this.img.frame.name) !== String(boss.frame)) this.img.setFrame(boss.frame);
    this.img.setDisplaySize(dw, dh);
    this.img.setPosition(dx + dw, dy);
  }

  /** Measure the opaque content of every cell (alpha > threshold counts). */
  private measure(): void {
    const texture = this.img.scene.textures.get(BOSS_KEY);
    if (!texture || !texture.key || texture.key === '__MISSING') return;
    const source = texture.getSourceImage() as HTMLImageElement;
    if (!source || !source.width) return;

    const w = source.width;
    const h = source.height;
    const oc = document.createElement('canvas');
    oc.width = w;
    oc.height = h;
    const ox = oc.getContext('2d', { willReadFrequently: true })!;
    ox.drawImage(source, 0, 0);
    let data: ImageData;
    try {
      data = ox.getImageData(0, 0, w, h);
    } catch {
      return;
    }
    const px = data.data;
    const opaque = (x: number, y: number): boolean => px[(y * w + x) * 4 + 3] > 16;

    let top = h;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (opaque(x, y)) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          break;
        }
      }
    }
    if (bottom < 0) return;

    const frames: FrameBox[] = [];
    for (let f = 0; f < BOSS.FRAMES; f++) {
      const x0 = Math.round((f * w) / BOSS.FRAMES);
      const x1 = Math.round(((f + 1) * w) / BOSS.FRAMES) - 1;
      let lo = -1;
      let hi = -1;
      for (let x = x0; x <= x1; x++) {
        for (let y = top; y <= bottom; y++) {
          if (opaque(x, y)) {
            if (lo < 0) lo = x;
            hi = x;
            break;
          }
        }
      }
      frames.push(lo < 0 ? { sx: x0, sw: x1 - x0 + 1 } : { sx: lo, sw: hi - lo + 1 });
    }

    // Publish every measured content box as a real frame of the sheet, so
    // update() can pick it with setFrame(). `Texture.add` returns null when the
    // frame is already there, so the second scene that measures the same sheet
    // simply reuses these.
    const contentH = bottom - top + 1;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      texture.add(i, 0, f.sx, top, f.sw, contentH);
    }

    this.frames = frames;
    this.contentH = contentH;
    this.sheetH = h;
    this.measured = true;
  }
}
