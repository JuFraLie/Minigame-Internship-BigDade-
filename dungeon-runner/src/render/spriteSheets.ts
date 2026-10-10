// spriteSheets.ts — knight + boss sprite loading.
// Presentation-only concerns (Phaser textures); reads no game
// state and decides nothing.

import { BOSS, KNIGHT } from '../config/gameConfig.ts';
import type { KnightState } from '../game/knight.ts';

/** Texture key per simulation state. */
export const SHEET_KEYS: Record<KnightState, string> = {
  running: 'knight_run',
  jumping: 'knight_jump',
  shielding: 'knight_shield',
};

export const BOSS_KEY = 'boss_walk';

const STATES: readonly KnightState[] = ['running', 'jumping', 'shielding'];

/** Queues the knight + boss sheets with the Preloader (path: public/assets). */
export function loadSheets(load: Phaser.Loader.LoaderPlugin): void {
  load.setPath('assets');
  load.image(SHEET_KEYS.running, KNIGHT.SHEETS.running);
  load.image(SHEET_KEYS.jumping, KNIGHT.SHEETS.jumping);
  load.image(SHEET_KEYS.shielding, KNIGHT.SHEETS.shielding);
  load.image(BOSS_KEY, BOSS.SHEET);
}

/**
 * Strips the flat white knight-sheet backgrounds to transparency, then rebuilds
 * each image as a Phaser spritesheet with KNIGHT.FRAMES[state] frames. Runs once
 * after loading (Preloader.create), before any scene shows a knight.
 * The boss sheet already carries an alpha channel and is left untouched —
 * BossView crops its frames directly from the loaded image.
 */
export function installSheets(textures: Phaser.Textures.TextureManager): void {
  for (const state of STATES) {
    const key = SHEET_KEYS[state];
    const frameCount = KNIGHT.FRAMES[state];
    const source = textures.get(key).getSourceImage() as HTMLImageElement;
    const canvas = stripWhite(source, KNIGHT.WHITE_STRIP_THRESHOLD);
    const frameWidth = Math.floor(canvas.width / frameCount);

    textures.remove(key);
    const sheet = textures.addCanvas(key, canvas);
    if (!sheet) continue;
    for (let i = 0; i < frameCount; i++) {
      sheet.add(i, 0, i * frameWidth, 0, frameWidth, canvas.height);
    }
  }
}

function stripWhite(img: HTMLImageElement, threshold: number): HTMLCanvasElement {
  const oc = document.createElement('canvas');
  oc.width = img.width;
  oc.height = img.height;
  const ox = oc.getContext('2d')!;
  ox.drawImage(img, 0, 0);
  const pix = ox.getImageData(0, 0, oc.width, oc.height);
  const d = pix.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold) {
      d[i + 3] = 0;
    }
  }
  ox.putImageData(pix, 0, 0);
  return oc;
}
