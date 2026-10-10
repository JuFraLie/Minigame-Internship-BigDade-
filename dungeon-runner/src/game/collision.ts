// collision.ts — pure collision rules: given entities, is it a hit?
// No state, no side effects, nothing DOM-related.

import { Knight } from './knight.ts';
import { obstacleHitbox, type Obstacle } from './obstacles.ts';
import { pickupHitbox, type Pickup } from './pickups.ts';
import type { Rect } from '../core/types.ts';

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Spike clusters always hurt; flyers are blocked by an active shield and are
 * also cleared when the knight is already well above them mid-jump; arrows are
 * blocked only by the shield — the stack is too tall to jump over.
 */
export function hitsObstacle(
  knight: Knight,
  obstacles: readonly Obstacle[],
  floorY: number,
): boolean {
  const kh = knight.getHitbox();

  for (const obs of obstacles) {
    if (!obs.active) continue;
    const h = obstacleHitbox(obs, floorY);

    if (obs.type === 'spike_cluster') {
      // Must jump to avoid — the shield does NOT help.
      if (overlaps(kh, h)) return true;
    } else if (obs.type === 'flyer') {
      if (knight.isShielding) continue; // shield deflects bats
      if (knight.state === 'jumping' && kh.y + kh.h < (obs.flyY ?? 0)) continue; // flying above it
      if (overlaps(kh, h)) return true;
    } else if (obs.type === 'arrow') {
      // The shield is the ONLY answer — the stack reaches from knee height to
      // above the knight's highest jump, so no jump stays clear of it.
      if (knight.isShielding) continue;
      if (overlaps(kh, h)) return true;
    }
  }

  return false;
}

/**
 * Checks the knight against every active pickup (coins and hearts). Collected
 * items are deactivated so they can never pay twice, and are returned grouped
 * by type — WHAT was collected is the controller's decision to price.
 */
export function collectPickups(
  knight: Knight,
  pickups: readonly Pickup[],
): { coins: Pickup[]; hearts: Pickup[] } {
  const kh = knight.getHitbox();
  const coins: Pickup[] = [];
  const hearts: Pickup[] = [];

  for (const p of pickups) {
    if (!p.active) continue;
    if (!overlaps(kh, pickupHitbox(p))) continue;

    p.active = false;
    if (p.type === 'coin') coins.push(p);
    else hearts.push(p);
  }

  return { coins, hearts };
}


