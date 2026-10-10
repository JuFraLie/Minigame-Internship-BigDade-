// background.ts — parallax scenery: dark background, scrolling stone wall,
// torches, clouds, floor. A Phaser Graphics view — it reads a scroll speed,
// it never decides one. Everything is positioned through the Layout port,
// so it works at any screen height (§3.1).

import type { Layout } from '../core/types.ts';

/** Flicker clock of ONE torch slot — the rhythm repeats across the corridor. */
interface Torch {
  flicker: number;
  flickerT: number;
}

/** Torch rhythm in world px. The on-screen step is exactly this value. */
const TORCH_SPACING = 320;
/** How many flicker slots that repeating rhythm reuses. */
const TORCH_SLOTS = 20;

/**
 * Every torch visible on a `gameW`-wide screen at `scrollX`: its world index
 * (which picks the flicker slot) and its screen X.
 *
 * The WORLD index wraps, never the screen X. Folding screen positions into a
 * `gameW + spacing` window — which is NOT a multiple of the torch step — piled
 * several torches onto the very same pixel on most widths: ten at 320px, four
 * at 480px, and a 40px jostle everywhere else on a 9:16 screen, so the flames
 * fused into one smear instead of reading as a row of candles. Stepping the
 * index keeps the rhythm exactly TORCH_SPACING at any screen width (§3.1),
 * and it is pure, so tests/background.test.ts can pin it down.
 */
export function torchScreenXs(gameW: number, scrollX: number): { i: number; x: number }[] {
  const parallax = scrollX * 0.7;
  const first = Math.floor((parallax - 120) / TORCH_SPACING);
  const last = Math.ceil((parallax + gameW + 120) / TORCH_SPACING);
  const out: { i: number; x: number }[] = [];

  for (let i = first; i <= last; i++) {
    const x = i * TORCH_SPACING + 60 - parallax;
    if (x > -60 && x < gameW + 60) out.push({ i, x });
  }
  return out;
}

interface Cloud {
  worldX: number;
  yFrac: number;
  w: number;
}

export class DungeonBackground {
  private readonly layout: Layout;
  private readonly g: Phaser.GameObjects.Graphics;
  private scrollX = 0;
  private readonly torches: Torch[] = [];
  private readonly clouds: Cloud[] = [];

  constructor(scene: Phaser.Scene, layout: Layout) {
    this.layout = layout;
    this.g = scene.add.graphics().setDepth(0);
    for (let i = 0; i < TORCH_SLOTS; i++) {
      this.torches.push({ flicker: 1, flickerT: 0 });
    }
    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        worldX: i * 280 + Math.random() * 120,
        yFrac: 0.12 + Math.random() * 0.1,
        w: 60 + Math.random() * 60,
      });
    }
  }

  update(viewSpeed: number, dt: number): void {
    this.scrollX += viewSpeed * dt;
    this.draw(dt);
  }

  private draw(dt: number): void {
    const gw = this.layout.gameW;
    const gh = this.layout.gameH;
    const floorY = this.layout.floorY();
    const g = this.g;

    g.clear();

    // ── Sky fill ──
    g.fillStyle(0x0f0f1a, 1).fillRect(0, 0, gw, gh);

    // ── Drifting clouds (slowest parallax) ──
    this.drawClouds(gw, gh);

    // ── Distant stone arch silhouettes (slow parallax) ──
    this.drawArches(floorY, this.scrollX * 0.15);

    // ── Subtle background mist ──
    this.drawMist(gw, floorY);

    // ── Scrolling stone wall segments (mid parallax) ──
    this.drawWall(floorY, this.scrollX * 0.45);

    // ── Torches ──
    for (const torch of torchScreenXs(gw, this.scrollX)) {
      const slot = this.torches[((torch.i % TORCH_SLOTS) + TORCH_SLOTS) % TORCH_SLOTS];
      slot.flickerT += dt;
      if (slot.flickerT > 0.07 + Math.random() * 0.08) {
        slot.flickerT = 0;
        slot.flicker = 0.75 + Math.random() * 0.25;
      }
      this.drawTorch(torch.x, floorY - (gh - floorY) * 0.5, slot.flicker);
    }

    // ── Floor ──
    this.drawFloor(gw, gh, floorY, this.scrollX);
  }

  private drawClouds(gw: number, gh: number): void {
    const g = this.g;
    const span = gw + 400;
    for (const c of this.clouds) {
      const sx = (((c.worldX - this.scrollX * 0.05) % span) + span) % span - 200;
      const y = c.yFrac * gh;
      g.fillStyle(0x1c1c30, 0.8);
      g.fillEllipse(sx, y, c.w, c.w * 0.35);
      g.fillEllipse(sx - c.w * 0.3, y + 4, c.w * 0.6, c.w * 0.28);
      g.fillEllipse(sx + c.w * 0.3, y + 4, c.w * 0.6, c.w * 0.28);
    }
  }

  private drawArches(floorY: number, ox: number): void {
    const gw = this.layout.gameW;
    const g = this.g;
    g.fillStyle(0x141420, 1);
    const spacing = 280;
    const cols = Math.ceil(gw / spacing) + 2;
    const offset = ox % spacing;

    for (let i = -1; i < cols; i++) {
      const ax = i * spacing - offset;
      const archW = 100;
      const archH = floorY * 0.55;

      g.fillRect(ax, floorY - archH, 18, archH);
      g.fillRect(ax + archW - 18, floorY - archH, 18, archH);
      g.fillRect(ax, floorY - archH, archW, 22);
    }
  }

  private drawMist(gw: number, floorY: number): void {
    // Vertical alpha ramp approximated with stacked strips (no gradients on CANVAS batching).
    const strips = 6;
    const stripH = 30 / strips;
    for (let i = 0; i < strips; i++) {
      const alpha = (0.45 * (i + 1)) / strips;
      this.g.fillStyle(0x141428, alpha);
      this.g.fillRect(0, floorY - 30 + i * stripH, gw, stripH + 1);
    }
  }

  private drawWall(floorY: number, ox: number): void {
    const gw = this.layout.gameW;
    const g = this.g;
    const rowH = 22;
    const rows = Math.ceil(floorY / rowH);
    g.lineStyle(1, 0x1f1f30, 1);

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const brickOffset = (r % 2 === 0 ? 0 : 40) - (ox % 80);
      const brickW = 80;
      const cols = Math.ceil(gw / brickW) + 2;

      for (let c = -1; c < cols; c++) {
        g.strokeRect(c * brickW + brickOffset + 1, y + 1, brickW - 2, rowH - 2);
      }
    }
  }

  private drawTorch(x: number, y: number, flicker: number): void {
    const g = this.g;

    g.fillStyle(0x4a3820, 1);
    g.fillRect(x - 4, y, 8, 14);
    g.fillRect(x - 8, y + 4, 16, 5);

    // Glow — concentric rings approximate a radial gradient
    const r = flicker * 38;
    for (let k = 6; k >= 1; k--) {
      g.fillStyle(0xffb43c, 0.045 * flicker);
      g.fillCircle(x, y - 2, (r * k) / 6);
    }

    // Flame (3 layers)
    for (let i = 0; i < 3; i++) {
      const fw = (6 - i * 1.5) * flicker;
      const fh = (14 - i * 3) * flicker;
      g.fillStyle(i === 0 ? 0xff6600 : i === 1 ? 0xffaa00 : 0xffee88, 1);
      g.fillEllipse(x, y - 4 - i * 3, fw, fh);
    }
  }

  private drawFloor(gw: number, gh: number, floorY: number, ox: number): void {
    const g = this.g;

    g.fillStyle(0x1a1a28, 1).fillRect(0, floorY, gw, gh - floorY);

    g.fillStyle(0x22223a, 1);
    const stoneW = 48;
    const stoneH = 16;
    const cols = Math.ceil(gw / stoneW) + 2;
    for (let c = -1; c < cols; c++) {
      const sx = c * stoneW - ((ox * 0.9) % stoneW);
      g.fillRect(sx + 2, floorY + 8, stoneW - 4, stoneH - 4);
      g.fillRect(sx + 2 + stoneW / 2, floorY + 8 + stoneH, stoneW - 4, stoneH - 4);
    }

    // Floor glow strips (no gradient)
    const strips = 6;
    for (let i = 0; i < strips; i++) {
      g.fillStyle(0x7878dc, (0.25 * (i + 1)) / strips);
      g.fillRect(0, floorY - 12 + i * 2, gw, 3);
    }

    g.fillStyle(0xddddff, 1).fillRect(0, floorY, gw, 2);
    g.fillStyle(0x6655bb, 1).fillRect(0, floorY + 2, gw, 4);
    g.fillStyle(0x44446a, 1).fillRect(0, floorY + 6, gw, 2);
  }
}
