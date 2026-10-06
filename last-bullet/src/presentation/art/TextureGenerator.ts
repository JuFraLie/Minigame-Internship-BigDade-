import type Phaser from 'phaser';
import {
  AMBER,
  CORAL,
  CYAN,
  INK,
  MOSS,
  PAPER,
  SLATE,
  GRID_HEX,
  VIOLET,
} from '../palette.ts';

/**
 * All art is baked at boot into canvas textures - no image files, nothing to
 * download, nothing to fail offline (AGENTS.md A3.4).
 *
 * The shapes are deliberately flat and high-contrast: at the 120-zombie cap
 * the only thing that keeps a fight readable is silhouette plus colour.
 */

/** Nominal radius each zombie texture is drawn at; the view scales from it. */
export const ENEMY_TEXTURE_RADIUS: Readonly<Record<'zombie' | 'fast' | 'tank', number>> = {
  zombie: 15,
  fast: 13,
  tank: 23,
};

/** Edge length of the repeating floor tile. */
export const GRID_SIZE = 128;

/** Nominal radius of the Explosive Round blast ring, for scaling it to a hit. */
export const RING_RADIUS = 56;

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

const bake = (
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: Draw,
): void => {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  draw(texture.getContext(), width, height);
  texture.refresh();
};

/** arcTo-based so it works in any WebView, not just ones with `roundRect`. */
const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const heartPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void => {
  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 9 * s);
  ctx.bezierCurveTo(cx + 13 * s, cy + 1 * s, cx + 12 * s, cy - 9 * s, cx + 5 * s, cy - 9 * s);
  ctx.bezierCurveTo(cx + 1 * s, cy - 9 * s, cx, cy - 5 * s, cx, cy - 5 * s);
  ctx.bezierCurveTo(cx, cy - 5 * s, cx - 1 * s, cy - 9 * s, cx - 5 * s, cy - 9 * s);
  ctx.bezierCurveTo(cx - 12 * s, cy - 9 * s, cx - 13 * s, cy + 1 * s, cx, cy + 9 * s);
  ctx.closePath();
};

/** Bakes every texture the game uses. Safe to call from every scene. */
export const generateTextures = (scene: Phaser.Scene): void => {
  // --- player: a disc with a barrel, drawn pointing along +x -------------
  bake(scene, 'player', 34, 34, (ctx) => {
    ctx.translate(17, 17);
    ctx.fillStyle = CYAN;
    roundedRect(ctx, 1, -3.5, 16, 7, 3.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- bullet, in flight and on the ground --------------------------------
  bake(scene, 'bullet', 20, 12, (ctx) => {
    ctx.fillStyle = AMBER;
    roundedRect(ctx, 1, 3, 17, 6, 3);
    ctx.fill();
    ctx.fillStyle = PAPER;
    roundedRect(ctx, 11, 4.5, 5, 3, 1.5);
    ctx.fill();
  });

  // --- Explosive Round: the ring the blast leaves behind -------------------
  bake(scene, 'ring', 128, 128, (ctx) => {
    ctx.translate(64, 64);
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, 0, RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(0, 0, RING_RADIUS - 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // --- zombies ------------------------------------------------------------
  bake(scene, 'enemy_zombie', 34, 34, (ctx) => {
    ctx.translate(17, 17);
    ctx.fillStyle = MOSS;
    ctx.beginPath();
    ctx.arc(0, 0, ENEMY_TEXTURE_RADIUS.zombie, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-4.5, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4.5, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-5, 4, 10, 3.5);
  });

  bake(scene, 'enemy_fast', 30, 30, (ctx) => {
    ctx.translate(15, 15);
    ctx.fillStyle = CORAL;
    const r = ENEMY_TEXTURE_RADIUS.fast;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.75);
    ctx.lineTo(-r * 0.7, -r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(1, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  bake(scene, 'enemy_tank', 50, 50, (ctx) => {
    ctx.translate(25, 25);
    const half = ENEMY_TEXTURE_RADIUS.tank;
    ctx.fillStyle = VIOLET;
    roundedRect(ctx, -half, -half, half * 2, half * 2, 9);
    ctx.fill();
    ctx.fillStyle = INK;
    roundedRect(ctx, -7, -4, 14, 8, 3);
    ctx.fill();
  });

  // --- pickup glow: the one gradient in the game --------------------------
  bake(scene, 'glow', 140, 140, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      2,
      width / 2,
      height / 2,
      width / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 200, 87, 0.75)');
    gradient.addColorStop(0.45, 'rgba(255, 200, 87, 0.22)');
    gradient.addColorStop(1, 'rgba(255, 200, 87, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });

  // --- repeating floor tile ----------------------------------------------
  bake(scene, 'grid', GRID_SIZE, GRID_SIZE, (ctx, width, height) => {
    ctx.strokeStyle = `#${GRID_HEX.toString(16).padStart(6, '0')}`;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, height);
    ctx.moveTo(0, 0.5);
    ctx.lineTo(width, 0.5);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // --- HUD hearts ---------------------------------------------------------
  bake(scene, 'heart_on', 28, 26, (ctx) => {
    heartPath(ctx, 14, 14, 24);
    ctx.fillStyle = CORAL;
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(9, 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  bake(scene, 'heart_off', 28, 26, (ctx) => {
    heartPath(ctx, 14, 14, 24);
    ctx.strokeStyle = SLATE;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // --- floating stick -----------------------------------------------------
  bake(scene, 'stick_base', 132, 132, (ctx) => {
    ctx.strokeStyle = CYAN;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(66, 66, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(66, 66, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  bake(scene, 'stick_knob', 72, 72, (ctx) => {
    ctx.fillStyle = CYAN;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(36, 36, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(36, 36, 11, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- kill sparks --------------------------------------------------------
  bake(scene, 'spark', 12, 12, (ctx) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(6, 6, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- chamber pips -------------------------------------------------------
  bake(scene, 'pip_on', 16, 16, (ctx) => {
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(8, 8, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(8, 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  bake(scene, 'pip_off', 16, 16, (ctx) => {
    ctx.strokeStyle = SLATE;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(8, 8, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
};
