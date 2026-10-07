import { CONTACT_SINK, PLAYER_RADIUS } from './config.ts';
import type { Enemy } from './entities.ts';

/**
 * Pure geometry: distances, the two body-separation corrections and the
 * segment/circle test the bullets aim with.
 *
 * Nothing here knows about the pools, the field or the round - it takes
 * numbers and records and writes positions back. That is what lets the crowd
 * rules be reasoned about (and changed) without opening the simulation.
 */

export const TAU = Math.PI * 2;

/** Squared distance, so the hot paths never take a square root they skip. */
export const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/**
 * Resolves one overlapping pair: each body takes half of the gap along the
 * line joining them, so neither is favoured. Two zombies dropped on exactly
 * the same point still need a direction, and it has to be a *stable* one -
 * so it is derived from their slot ids rather than from the RNG, whose
 * stream belongs to gameplay and must not be spent on geometry.
 */
export const pushApart = (a: Enemy, b: Enemy, i: number, j: number): void => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = a.radius + b.radius;
  const dSq = dx * dx + dy * dy;
  if (dSq >= reach * reach) return;

  const d = Math.sqrt(dSq);
  let nx: number;
  let ny: number;
  if (d > 1e-6) {
    nx = dx / d;
    ny = dy / d;
  } else {
    // Both slots hashed to one point: a stable pseudo-angle from the ids.
    const hash = Math.imul(i + 1, 2654435761) ^ Math.imul(j + 1, 40503);
    const angle = (hash / 4294967296) * TAU;
    nx = Math.cos(angle);
    ny = Math.sin(angle);
  }

  const nudge = (reach - d) * 0.5;
  a.x -= nx * nudge;
  a.y -= ny * nudge;
  b.x += nx * nudge;
  b.y += ny * nudge;
};

/**
 * The player is a fixed body: only the zombie gives ground, and it is placed
 * exactly on the resting edge rather than nudged, so repeated steps cannot
 * grind it through. That edge sits `CONTACT_SINK` inside the contact radius,
 * so the damage test - `<=` against the full radius - is never decided by a
 * rounding error. The horde therefore arrives *around* the player instead of
 * inside them, at no cost to how often it hits.
 */
export const pushOutOfPlayer = (enemy: Enemy, px: number, py: number): void => {
  const rest = enemy.radius + PLAYER_RADIUS - CONTACT_SINK;
  const dx = enemy.x - px;
  const dy = enemy.y - py;
  const dSq = dx * dx + dy * dy;
  if (dSq >= rest * rest) return;

  const d = Math.sqrt(dSq);
  if (d > 1e-6) {
    enemy.x = px + (dx / d) * rest;
    enemy.y = py + (dy / d) * rest;
  } else {
    enemy.x = px + rest;
  }
};

/** Does the segment a->b come within `radius` of the circle at c? */
export const segmentIntersectsCircle = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): boolean => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / lenSq : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return distSq(ax + t * dx, ay + t * dy, cx, cy) <= radius * radius;
};
