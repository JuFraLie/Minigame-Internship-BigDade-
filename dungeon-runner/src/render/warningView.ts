// warningView.ts — danger telegraph: a pulsing marker at the right edge, in the
// lane a trap is about to occupy, so the player can prepare BEFORE the trap
// scrolls onto the screen. Pure maths + drawing; it never mutates game state.

import { OBSTACLES } from '../config/gameConfig.ts';
import type { Obstacle, TrapType } from '../game/obstacles.ts';

export interface DangerMarker {
  /** Logical centre of the lane that is about to be threatened. */
  y: number;
  /** Which trap is coming — spikes → jump, bats/arrows → shield. */
  kind: TrapType;
}

/**
 * Markers for traps still beyond the right edge but close enough to act on.
 * The lead is TIME-based (seconds × current speed), so every scroll speed
 * gives the player the same reaction window. Traps already on screen need no
 * marker — they are their own warning. The arrows of one stack share an x, so
 * the whole wall is telegraphed by a single marker at its centre.
 */
export function dangerMarkers(
  obstacles: readonly Obstacle[],
  gameW: number,
  floorY: number,
  speed: number,
): DangerMarker[] {
  const lead = OBSTACLES.DANGER_LEAD_SECONDS * speed;
  const markers: DangerMarker[] = [];
  const markedStacks = new Set<number>();

  for (const obs of obstacles) {
    if (obs.x < gameW) continue;
    if (obs.x - gameW > lead) continue;

    if (obs.type === 'arrow') {
      const key = Math.round(obs.x);
      if (markedStacks.has(key)) continue;
      markedStacks.add(key);
      markers.push({ y: arrowStackCenterY(obs.x, obstacles, floorY), kind: 'arrow' });
      continue;
    }

    markers.push({ y: markerY(obs, floorY), kind: obs.type });
  }
  return markers;
}

function arrowStackCenterY(x: number, obstacles: readonly Obstacle[], floorY: number): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (const o of obstacles) {
    if (o.type !== 'arrow' || Math.abs(o.x - x) > 0.5) continue;
    const y = o.arrowY ?? floorY - OBSTACLES.ARROW_Y_OFFSET;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (!Number.isFinite(top)) return floorY - OBSTACLES.ARROW_Y_OFFSET + OBSTACLES.ARROW_HIT_H / 2;
  return (top + bottom + OBSTACLES.ARROW_HIT_H) / 2;
}

function markerY(obs: Obstacle, floorY: number): number {
  if (obs.type === 'spike_cluster') return floorY - 20;
  if (obs.type === 'flyer') return (obs.flyY ?? 0) + OBSTACLES.BAT_CENTER_DY;
  return (obs.arrowY ?? floorY - OBSTACLES.ARROW_Y_OFFSET) + OBSTACLES.ARROW_HIT_H / 2;
}

export class WarningView {
  private readonly g: Phaser.GameObjects.Graphics;
  private clock = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(15);
  }

  update(markers: readonly DangerMarker[], dt: number, gameW: number): void {
    this.clock += dt;
    const g = this.g;
    g.clear();
    if (markers.length === 0) return;

    const x = gameW - OBSTACLES.DANGER_MARGIN;
    // The pulse has to survive until the frame is drawn: a Graphics object
    // reads its alpha at render time, not while its commands are recorded.
    // Resetting it to 1 here froze the markers at full brightness, so the
    // telegraph read as scenery instead of as a warning.
    g.setAlpha(0.55 + 0.45 * Math.sin(this.clock * 10));

    for (const m of markers) {
      g.fillStyle(0xff4433, 1);
      g.fillTriangle(x, m.y, x + 24, m.y - 13, x + 24, m.y + 13);
      g.lineStyle(2, 0x5a1208, 1);
      g.strokeTriangle(x, m.y, x + 24, m.y - 13, x + 24, m.y + 13);

      g.fillStyle(0xffffff, 1);
      g.fillRect(x + 10, m.y - 7, 3.5, 8);
      g.fillRect(x + 10, m.y + 3.5, 3.5, 3.5);
    }
  }

  reset(): void {
    this.clock = 0;
  }
}
