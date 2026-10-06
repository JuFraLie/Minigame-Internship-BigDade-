import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { heartPath, type Ctx } from '../src/presentation/art/draw.ts';
import {
  HEART_CRACK,
  HEART_H,
  HEART_OUTLINE,
  HEART_SIZE,
  HEART_W,
} from '../src/presentation/art/TextureGenerator.ts';

/**
 * The hearts are baked into a fixed canvas, so a path that runs past its
 * edge gets chopped — which is exactly what happened before: the old heart
 * reached x≈41 plus its outline on a 40px texture, and its two halves were
 * not mirror images. These tests drive the real `heartPath` through a
 * recording context and check what would actually be painted.
 */

interface Sample {
  readonly x: number;
  readonly y: number;
}

/** Dense sampling of the path, close enough to bound it within 0.05px. */
function samplePath(draw: (ctx: Ctx) => void): Sample[] {
  const points: Sample[] = [];
  let x = 0;
  let y = 0;
  const push = (px: number, py: number): void => {
    points.push({ x: px, y: py });
  };

  const ctx = {
    moveTo(nx: number, ny: number): void {
      x = nx;
      y = ny;
      push(x, y);
    },
    lineTo(nx: number, ny: number): void {
      x = nx;
      y = ny;
      push(x, y);
    },
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, nx: number, ny: number): void {
      const x0 = x;
      const y0 = y;
      for (let i = 1; i <= 96; i++) {
        const t = i / 96;
        const u = 1 - t;
        push(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny,
        );
      }
      x = nx;
      y = ny;
    },
    // Only ever called with an increasing sweep, like the heart's two lobes.
    arc(cx: number, cy: number, r: number, start: number, end: number): void {
      const steps = 128;
      for (let i = 0; i <= steps; i++) {
        const angle = start + ((end - start) * i) / steps;
        push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      }
      x = cx + Math.cos(end) * r;
      y = cy + Math.sin(end) * r;
    },
    closePath(): void {
      // The outline is closed by the caller; sampling both endpoints is enough.
    },
  };

  draw(ctx as unknown as Ctx);
  return points;
}

function bounds(samples: Sample[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Ray casting: is the point strictly inside the closed outline? */
function isInside(point: Sample, outline: Sample[]): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to the outline — how much room it has. */
function clearance(point: Sample, outline: Sample[]): number {
  let best = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const px = a.x + t * dx - point.x;
    const py = a.y + t * dy - point.y;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

const heartOutline = (): Sample[] =>
  samplePath((ctx) => heartPath(ctx, HEART_W / 2, HEART_H / 2, HEART_SIZE));

describe('heart texture', () => {
  test('the whole heart, outline included, fits in its texture', () => {
    const b = bounds(heartOutline());
    const pad = HEART_OUTLINE / 2;
    const limit = 0.05; // sampling error only

    assert.ok(b.minX - pad >= -limit, `left edge cut off: ${b.minX - pad}`);
    assert.ok(b.maxX + pad <= HEART_W + limit, `right edge cut off: ${b.maxX + pad}`);
    assert.ok(b.minY - pad >= -limit, `top edge cut off: ${b.minY - pad}`);
    assert.ok(b.maxY + pad <= HEART_H + limit, `bottom edge cut off: ${b.maxY + pad}`);
  });

  test('the two halves are mirror images, so the heart sits centred', () => {
    const b = bounds(heartOutline());
    const centreX = (b.minX + b.maxX) / 2;
    const centreY = (b.minY + b.maxY) / 2;

    assert.ok(Math.abs(centreX - HEART_W / 2) <= 0.2, `off-centre by ${centreX - HEART_W / 2}px`);
    assert.ok(Math.abs(centreY - HEART_H / 2) <= 0.2, `off-centre by ${centreY - HEART_H / 2}px`);
  });

  test('the heart still fills its box instead of shrinking away', () => {
    const b = bounds(heartOutline());
    assert.ok(Math.abs(b.maxX - b.minX - HEART_SIZE) <= 0.2, `width ${b.maxX - b.minX}`);
    assert.ok(Math.abs(b.maxY - b.minY - HEART_SIZE * 0.94) <= 0.2, `height ${b.maxY - b.minY}`);
  });

  test('the crack of the broken heart stays inside the shape', () => {
    const outline = heartOutline();
    for (const [x, y] of HEART_CRACK) {
      const point = { x, y };
      assert.ok(isInside(point, outline), `crack vertex (${x}, ${y}) fell outside the heart`);
      // Half the 3px crack stroke, so the line itself never pokes out.
      assert.ok(clearance(point, outline) >= 1.5, `crack vertex (${x}, ${y}) touches the edge`);
    }
  });
});
