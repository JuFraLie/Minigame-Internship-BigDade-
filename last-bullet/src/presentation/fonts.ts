import type Phaser from 'phaser';

/**
 * The game's typeface - one face for headings and body alike.
 *
 * It ships inside `public/assets/` like every other asset, because the WebView
 * this runs in has no network and a CDN face would simply never arrive
 * (AGENTS.md A3.4). It is queued through the loader rather than declared in
 * CSS on purpose: text objects rasterise once, at creation, so a face that
 * finished loading *after* the first labels were built would leave them in the
 * fallback forever with no way back.
 */
export const FONT_FAMILY = 'Minecraft';

/** Relative to the page, so the game still finds the face under a sub-path. */
export const FONT_ART = 'assets/font/minecraft/Minecraft.ttf';

/**
 * System faces sit behind it, so a font that fails to parse still leaves every
 * label readable instead of turning the UI into blank boxes.
 */
export const FONT_HEAD = '"Minecraft", "Arial Black", Impact, sans-serif';
export const FONT_BODY = '"Minecraft", Arial, Helvetica, sans-serif';

/** Once per session: re-queueing would re-download and re-register the face. */
let queued = false;

/**
 * Queues the face. Safe to call from any scene's `preload` - the loader does
 * not finish until the face has really been parsed, so every text object
 * created afterwards rasterises with it.
 */
export const queueGameFont = (scene: Phaser.Scene): void => {
  if (queued) return;
  queued = true;
  scene.load.font(FONT_FAMILY, FONT_ART);
};
