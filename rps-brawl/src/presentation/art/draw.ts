/**
 * Low-level canvas helpers used to bake every texture once, at boot.
 *
 * The signature look comes from `paintSilhouette`: shapes are painted twice —
 * first dilated in ink, then at their real size in the body colour — which
 * produces one clean union outline with no seams between sub-shapes.
 */

import { CREAM, INK, WHITE } from './palette.ts';

export type Ctx = CanvasRenderingContext2D;

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

/** Ring with a hole, wound so `fill()` leaves the middle open. */
export function ringPath(ctx: Ctx, cx: number, cy: number, outer: number, inner: number): void {
  ctx.moveTo(cx + outer, cy);
  ctx.arc(cx, cy, outer, 0, Math.PI * 2, false);
  ctx.moveTo(cx + inner, cy);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.closePath();
}

/**
 * A heart, exactly `size` wide and `size * 0.94` tall, centred on (cx, cy).
 *
 * Two tangent lobes form the top and the notch; two mirrored cubic flanks
 * taper down to the tip. Everything is bounded by `cx ± size / 2` and
 * `top..bottom`, so the shape can never run past the texture it is baked
 * into — `tests/art.test.ts` asserts exactly that.
 */
export function heartPath(ctx: Ctx, cx: number, cy: number, size: number): void {
  const w = size;
  const h = size * 0.94;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  /** Radius of each lobe; the lobes touch at the centre, which is the notch. */
  const lobe = w * 0.25;
  /** The widest row: also where the flanks start and the notch dips to. */
  const shoulder = top + lobe;

  ctx.moveTo(cx, bottom);

  // Left flank, tip → widest point, arriving moving upwards.
  ctx.bezierCurveTo(
    cx - w * 0.30,
    top + h * 0.76,
    cx - w * 0.50,
    shoulder + w * 0.30,
    cx - w * 0.50,
    shoulder,
  );

  // Left lobe: widest point → over the top → notch.
  ctx.arc(cx - lobe, shoulder, lobe, Math.PI, Math.PI * 2, false);
  // Right lobe: notch → over the top → widest point.
  ctx.arc(cx + lobe, shoulder, lobe, Math.PI, Math.PI * 2, false);

  // Right flank, mirror of the left one, back down to the tip.
  ctx.bezierCurveTo(
    cx + w * 0.50,
    shoulder + w * 0.30,
    cx + w * 0.30,
    top + h * 0.76,
    cx,
    bottom,
  );

  ctx.closePath();
}

export interface Silhouette {
  /** Closed shape: filled and inked in both passes. */
  shape(draw: () => void): void;
  /** Thick stroked line: filled and inked in both passes. */
  bar(width: number, draw: () => void): void;
  /** Inked detail line, drawn on top of the final colour. */
  line(width: number, draw: () => void, color?: string): void;
  /** Filled detail, drawn on top of the final colour. */
  over(draw: () => void, color?: string): void;
}

export interface SilhouetteOptions {
  /** Outline thickness added to every shape. */
  dilate?: number;
  /** Body colour of the second pass. */
  color?: string;
}

export function paintSilhouette(ctx: Ctx, body: (p: Silhouette) => void, options: SilhouetteOptions = {}): void {
  const dilate = options.dilate ?? 10;
  const color = options.color ?? CREAM;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Pass 1 — dilated ink silhouette.
  body({
    shape: (draw) => {
      ctx.beginPath();
      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = dilate;
      draw();
      ctx.fill();
      ctx.stroke();
    },
    bar: (width, draw) => {
      ctx.beginPath();
      ctx.strokeStyle = INK;
      ctx.lineWidth = width + dilate;
      draw();
      ctx.stroke();
    },
    line: () => undefined,
    over: () => undefined,
  });

  // Pass 2 — real colours, details on top.
  body({
    shape: (draw) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      draw();
      ctx.fill();
    },
    bar: (width, draw) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      draw();
      ctx.stroke();
    },
    line: (width, draw, lineColor = INK) => {
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = width;
      draw();
      ctx.stroke();
    },
    over: (draw, overColor = INK) => {
      ctx.beginPath();
      ctx.fillStyle = overColor;
      draw();
      ctx.fill();
    },
  });

  ctx.restore();
}

export function centerText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  stroke = INK,
  strokeWidth = 6,
): void {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Filled ellipse, so shapes read as one-liners inside a painter body. */
export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

/** Two eyes with pupils, the workhorse of every cosmetic enemy. */
export function eyes(p: Silhouette, ctx: Ctx, leftX: number, rightX: number, y: number, radius: number): void {
  p.over(() => ellipse(ctx, leftX, y, radius, radius * 1.15), WHITE);
  p.over(() => ellipse(ctx, rightX, y, radius, radius * 1.15), WHITE);
  p.over(() => ellipse(ctx, leftX, y + radius * 0.25, radius * 0.45, radius * 0.5), INK);
  p.over(() => ellipse(ctx, rightX, y + radius * 0.25, radius * 0.45, radius * 0.5), INK);
}

/** A simple curved smile. */
export function smile(p: Silhouette, ctx: Ctx, cx: number, y: number, width: number): void {
  p.line(5, () => {
    ctx.arc(cx, y - width * 0.35, width, Math.PI * 0.15, Math.PI * 0.85);
  });
}
