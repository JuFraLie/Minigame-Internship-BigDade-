import type { Scene } from 'phaser';
import type { Sign } from '../../core/types.ts';
import { SIGNS } from '../../core/RpsRules.ts';
import { CARD_H, CARD_W } from '../layout/Layout.ts';
import {
  centerText,
  ellipse,
  eyes,
  heartPath,
  paintSilhouette,
  ringPath,
  roundRectPath,
  smile,
  type Ctx,
  type Silhouette,
} from './draw.ts';
import {
  AQUA,
  AMBER,
  BADGE_PLATE,
  HEART_EMPTY,
  INK,
  LILAC,
  MINT,
  PAPER,
  PAPER_DEEP,
  PAPER_MID,
  PERIWINKLE,
  ROSE,
  SAGE,
  SAND,
  SKY,
  TERRACOTTA,
  WHITE,
  toHex,
} from './palette.ts';

/**
 * Every texture the game uses, baked once with canvas 2D.
 *
 * Nothing is downloaded: the whole art direction (thick outlines, flat
 * colours) is generated at boot, so the app stays offline-first and tiny.
 * Every colour comes from `palette.ts`, the game's single theme file.
 */

/** Flat card colours, shared with the renderer for tints and particles. */
export const SIGN_HEX: Record<Sign, number> = {
  ROCK: toHex(TERRACOTTA),
  PAPER: toHex(SKY),
  SCISSORS: toHex(SAGE),
};

/** How many cosmetic enemy looks exist. They all behave identically. */
export const ENEMY_LOOK_COUNT = 6;

const SIGN_SKIN: Record<Sign, { fill: string; deep: string }> = {
  ROCK: { fill: css(SIGN_HEX.ROCK), deep: shade(SIGN_HEX.ROCK, -0.35) },
  PAPER: { fill: css(SIGN_HEX.PAPER), deep: shade(SIGN_HEX.PAPER, -0.35) },
  SCISSORS: { fill: css(SIGN_HEX.SCISSORS), deep: shade(SIGN_HEX.SCISSORS, -0.35) },
};

function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Darken (amount < 0) or lighten (amount > 0) an RGB hex value. */
function shade(hex: number, amount: number): string {
  const f = (c: number): number =>
    Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = f((hex >> 16) & 0xff);
  const g = f((hex >> 8) & 0xff);
  const b = f(hex & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function bake(scene: Scene, key: string, width: number, height: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx);
  texture.refresh();
}

// ── Sign icons ───────────────────────────────────────────────────────────────

/** Draws an icon inside a 140 x 140 design box. */
function drawRockIcon(ctx: Ctx): void {
  const left = 20;
  const right = 120;
  const baseY = 58;
  const bottom = 118;
  const corner = 18;
  const bumpR = 12.5;
  const span = right - left;
  const bumpStep = span / 4;

  paintSilhouette(
    ctx,
    (p) => {
      p.shape(() => {
        ctx.moveTo(left, bottom - corner);
        ctx.arcTo(left, bottom, left + corner, bottom, corner);
        ctx.lineTo(right - corner, bottom);
        ctx.arcTo(right, bottom, right, bottom - corner, corner);
        ctx.lineTo(right, baseY);
        for (let i = 3; i >= 0; i--) {
          ctx.arc(left + bumpR + i * bumpStep, baseY, bumpR, 0, Math.PI, true);
        }
        ctx.lineTo(left, baseY);
        ctx.lineTo(left, bottom - corner);
        ctx.closePath();
      });
      // Thumb wrapping across the front of the fist.
      p.shape(() => roundRectPath(ctx, 10, 86, 48, 26, 13));
      // Knuckle creases.
      for (let i = 1; i < 4; i++) {
        const x = left + i * bumpStep;
        p.line(4, () => {
          ctx.moveTo(x, baseY + 2);
          ctx.lineTo(x, 92);
        });
      }
    },
    { dilate: 10 },
  );
}

function drawPaperIcon(ctx: Ctx): void {
  const fingers = [
    { x: 34, y: 36, w: 20, h: 56 },
    { x: 57, y: 24, w: 20, h: 68 },
    { x: 80, y: 28, w: 20, h: 64 },
    { x: 103, y: 44, w: 20, h: 48 },
  ];

  paintSilhouette(
    ctx,
    (p) => {
      for (const f of fingers) {
        p.shape(() => roundRectPath(ctx, f.x, f.y, f.w, f.h, 10));
      }
      // Thumb, angled away from the palm.
      p.shape(() => {
        ctx.save();
        ctx.translate(44, 104);
        ctx.rotate(-0.78);
        roundRectPath(ctx, -13, -52, 26, 56, 13);
        ctx.restore();
      });
      // Palm.
      p.shape(() => roundRectPath(ctx, 28, 74, 88, 50, 22));
      // Finger separations.
      for (let i = 1; i < 4; i++) {
        const x = fingers[i].x - 1;
        p.line(4, () => {
          ctx.moveTo(x, fingers[i].y + 10);
          ctx.lineTo(x, 80);
        });
      }
      p.line(4, () => {
        ctx.moveTo(36, 78);
        ctx.lineTo(50, 118);
      });
    },
    { dilate: 10 },
  );
}

function drawScissorsIcon(ctx: Ctx): void {
  paintSilhouette(
    ctx,
    (p) => {
      // Two crossed blades.
      p.shape(() => {
        ctx.moveTo(66, 72);
        ctx.lineTo(106, 22);
        ctx.lineTo(120, 36);
        ctx.lineTo(78, 84);
        ctx.closePath();
      });
      p.shape(() => {
        ctx.moveTo(74, 72);
        ctx.lineTo(34, 22);
        ctx.lineTo(20, 36);
        ctx.lineTo(62, 84);
        ctx.closePath();
      });
      // Shanks down to the handles.
      p.bar(14, () => {
        ctx.moveTo(70, 80);
        ctx.lineTo(50, 96);
      });
      p.bar(14, () => {
        ctx.moveTo(70, 80);
        ctx.lineTo(90, 96);
      });
      // Finger rings.
      p.shape(() => ringPath(ctx, 46, 112, 22, 11));
      p.shape(() => ringPath(ctx, 94, 112, 22, 11));
      // Pivot.
      p.shape(() => ellipse(ctx, 70, 78, 10, 10));
    },
    { dilate: 10 },
  );
}

const ICON_PAINTERS: Record<Sign, (ctx: Ctx) => void> = {
  ROCK: drawRockIcon,
  PAPER: drawPaperIcon,
  SCISSORS: drawScissorsIcon,
};

/** Icon centred at (cx, cy) and scaled to `size` design pixels. */
function drawSignIcon(ctx: Ctx, sign: Sign, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 140, size / 140);
  ICON_PAINTERS[sign](ctx);
  ctx.restore();
}

// ── Cards and badges ─────────────────────────────────────────────────────────

function drawCard(ctx: Ctx, sign: Sign): void {
  const skin = SIGN_SKIN[sign];

  paintSilhouette(ctx, (p) => p.shape(() => roundRectPath(ctx, 6, 6, CARD_W - 12, CARD_H - 12, 18)), {
    dilate: 8,
    color: skin.fill,
  });

  // Subtle darker base so the card reads as a physical object.
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 6, 6, CARD_W - 12, CARD_H - 12, 18);
  ctx.clip();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = skin.deep;
  ctx.fillRect(0, CARD_H * 0.6, CARD_W, CARD_H);
  ctx.restore();

  drawSignIcon(ctx, sign, CARD_W / 2, 62, 78);
  centerText(ctx, sign, CARD_W / 2, CARD_H - 26, '900 15px Arial, sans-serif', WHITE, INK, 5);
}

function drawBadge(ctx: Ctx, content: 'HIDDEN' | Sign): void {
  paintSilhouette(ctx, (p) => p.shape(() => roundRectPath(ctx, 10, 10, 130, 130, 30)), {
    dilate: 9,
    color: BADGE_PLATE,
  });

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 250, 241, 0.30)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  roundRectPath(ctx, 24, 24, 102, 102, 22);
  ctx.stroke();
  ctx.restore();

  if (content === 'HIDDEN') {
    centerText(ctx, '?', 75, 80, '900 76px "Arial Black", Arial, sans-serif', AMBER, INK, 5);
  } else {
    drawSignIcon(ctx, content, 75, 75, 96);
  }
}

// ── Cosmetic enemies ─────────────────────────────────────────────────────────

type BodyKind = 'blob' | 'block' | 'ghost' | 'bot' | 'horned' | 'cat';

const LOOKS: ReadonlyArray<{ color: string; body: BodyKind }> = [
  { color: LILAC, body: 'blob' },
  { color: SAND, body: 'block' },
  { color: PERIWINKLE, body: 'ghost' },
  { color: AQUA, body: 'bot' },
  { color: ROSE, body: 'horned' },
  { color: MINT, body: 'cat' },
];

function drawCreature(ctx: Ctx, body: BodyKind, color: string): void {
  paintSilhouette(
    ctx,
    (p: Silhouette) => {
      switch (body) {
        case 'blob':
          p.shape(() => ellipse(ctx, 100, 112, 64, 58));
          p.shape(() => ellipse(ctx, 74, 172, 22, 15));
          p.shape(() => ellipse(ctx, 126, 172, 22, 15));
          break;
        case 'block':
          p.shape(() => roundRectPath(ctx, 36, 54, 128, 114, 26));
          p.shape(() => ellipse(ctx, 74, 172, 22, 15));
          p.shape(() => ellipse(ctx, 126, 172, 22, 15));
          break;
        case 'ghost':
          p.shape(() => {
            ctx.moveTo(40, 150);
            ctx.lineTo(40, 104);
            ctx.arc(100, 104, 60, Math.PI, 0);
            ctx.lineTo(160, 150);
            for (let i = 0; i < 3; i++) {
              ctx.arc(140 - i * 40, 150, 20, 0, Math.PI, false);
            }
            ctx.closePath();
          });
          break;
        case 'bot':
          p.bar(10, () => {
            ctx.moveTo(100, 58);
            ctx.lineTo(100, 34);
          });
          p.shape(() => ellipse(ctx, 100, 28, 12, 12));
          p.shape(() => roundRectPath(ctx, 44, 58, 112, 90, 22));
          p.shape(() => roundRectPath(ctx, 62, 148, 76, 34, 14));
          break;
        case 'horned':
          p.shape(() => {
            ctx.moveTo(52, 76);
            ctx.lineTo(68, 22);
            ctx.lineTo(90, 70);
            ctx.closePath();
          });
          p.shape(() => {
            ctx.moveTo(148, 76);
            ctx.lineTo(132, 22);
            ctx.lineTo(110, 70);
            ctx.closePath();
          });
          p.shape(() => ellipse(ctx, 100, 116, 64, 56));
          break;
        case 'cat':
          p.shape(() => {
            ctx.moveTo(56, 78);
            ctx.lineTo(62, 26);
            ctx.lineTo(100, 62);
            ctx.closePath();
          });
          p.shape(() => {
            ctx.moveTo(144, 78);
            ctx.lineTo(138, 26);
            ctx.lineTo(100, 62);
            ctx.closePath();
          });
          p.shape(() => ellipse(ctx, 100, 114, 62, 56));
          break;
      }

      // Faces.
      switch (body) {
        case 'blob':
          eyes(p, ctx, 78, 122, 104, 15);
          smile(p, ctx, 100, 140, 26);
          break;
        case 'block':
          eyes(p, ctx, 76, 124, 96, 14);
          p.line(5, () => {
            ctx.moveTo(78, 134);
            ctx.lineTo(100, 134);
            ctx.lineTo(100, 146);
            ctx.lineTo(122, 146);
          });
          break;
        case 'ghost':
          eyes(p, ctx, 78, 122, 96, 15);
          p.over(() => ellipse(ctx, 100, 134, 11, 13), INK);
          break;
        case 'bot':
          eyes(p, ctx, 76, 124, 100, 14);
          p.line(5, () => {
            ctx.moveTo(74, 130);
            ctx.lineTo(126, 130);
          });
          break;
        case 'horned':
          eyes(p, ctx, 78, 122, 108, 14);
          p.line(5, () => {
            ctx.moveTo(76, 142);
            ctx.lineTo(86, 152);
            ctx.lineTo(96, 142);
            ctx.lineTo(106, 152);
            ctx.lineTo(116, 142);
            ctx.lineTo(124, 150);
          });
          break;
        case 'cat':
          eyes(p, ctx, 78, 122, 108, 14);
          smile(p, ctx, 100, 138, 22);
          p.line(4, () => {
            ctx.moveTo(46, 122);
            ctx.lineTo(74, 128);
            ctx.moveTo(46, 140);
            ctx.lineTo(74, 138);
            ctx.moveTo(154, 122);
            ctx.lineTo(126, 128);
            ctx.moveTo(154, 140);
            ctx.lineTo(126, 138);
          });
          break;
      }
    },
    { dilate: 10, color },
  );
}

// ── HUD bits ─────────────────────────────────────────────────────────────────

/**
 * The heart geometry, exported so `tests/art.test.ts` can assert the shape
 * stays inside its texture (a clipped heart was a real bug once).
 */
export const HEART_W = 40;
export const HEART_H = 36;
export const HEART_SIZE = 30;
/** Outline dilation of every painted silhouette; the heart's is tighter. */
export const HEART_OUTLINE = 5;
/** The crack of the broken heart, from the notch down towards the tip. */
export const HEART_CRACK: ReadonlyArray<readonly [number, number]> = [
  [20, 14],
  [15, 20],
  [24, 24],
  [19, 29],
];

function drawHeart(ctx: Ctx, broken: boolean): void {
  paintSilhouette(
    ctx,
    (p) => p.shape(() => heartPath(ctx, HEART_W / 2, HEART_H / 2, HEART_SIZE)),
    {
      dilate: HEART_OUTLINE,
      color: broken ? HEART_EMPTY : ROSE,
    },
  );

  if (broken) {
    // The crack: starts at the notch and zig-zags down towards the tip.
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const [[firstX, firstY], ...rest] = HEART_CRACK;
    ctx.moveTo(firstX, firstY);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(13, 13, 4.5, 3.2, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSpark(ctx: Ctx): void {
  paintSilhouette(
    ctx,
    (p) =>
      p.shape(() => {
        const cx = 32;
        const cy = 32;
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const radius = i % 2 === 0 ? 27 : 9;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }),
    { dilate: 5, color: AMBER },
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Bakes every texture once. Safe to call from any scene. */
export function generateTextures(scene: Scene): void {
  // Painted paper backdrop, stretched to fill the screen by the renderer.
  bake(scene, 'bg', 8, 512, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, PAPER);
    gradient.addColorStop(0.55, PAPER_MID);
    gradient.addColorStop(1, PAPER_DEEP);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 8, 512);
  });

  // Warm halo behind the enemy, like a patch of afternoon light.
  bake(scene, 'glow', 256, 256, (ctx) => {
    const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 216, 172, 0.62)');
    gradient.addColorStop(0.6, 'rgba(255, 216, 172, 0.20)');
    gradient.addColorStop(1, 'rgba(255, 216, 172, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });

  for (const sign of SIGNS) {
    bake(scene, `card_${sign}`, CARD_W, CARD_H, (ctx) => drawCard(ctx, sign));
    bake(scene, `badge_${sign}`, 150, 150, (ctx) => drawBadge(ctx, sign));
  }
  bake(scene, 'badge_HIDDEN', 150, 150, (ctx) => drawBadge(ctx, 'HIDDEN'));

  LOOKS.forEach((look, index) => {
    bake(scene, `enemy_${index}`, 200, 200, (ctx) => drawCreature(ctx, look.body, look.color));
  });

  bake(scene, 'heart_full', HEART_W, HEART_H, (ctx) => drawHeart(ctx, false));
  bake(scene, 'heart_broken', HEART_W, HEART_H, (ctx) => drawHeart(ctx, true));
  bake(scene, 'spark', 64, 64, (ctx) => drawSpark(ctx));
}

