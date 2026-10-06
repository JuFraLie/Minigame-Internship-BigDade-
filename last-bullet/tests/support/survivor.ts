import type { Vec2, WorldFrame } from '../../src/core/types.ts';
import { FIRE_RANGE } from '../../src/core/config.ts';

/** A world vector that means "do not move". */
export const IDLE: Vec2 = { x: 0, y: 0 };

/** A unit vector from `(dx, dy)`, or `IDLE` for a zero-length one. */
export const unit = (dx: number, dy: number): Vec2 => {
  const d = Math.hypot(dx, dy);
  return d < 1e-6 ? IDLE : { x: dx / d, y: dy / d };
};

/** Below this the survivor backs off before anything can touch it. */
const STAND_OFF = 150;
/** Above this the survivor closes in so auto-fire can still reach. */
const ENGAGE = FIRE_RANGE - 20;

/**
 * A scripted survivor, so a combat test plays a run instead of feeding
 * itself to the horde.
 *
 * Two habits, in order:
 *
 *  1. re-arm - with one bullet in the chamber, a round that never walks over
 *     its own spent round has exactly one kill in it;
 *  2. hold the line - keep the nearest enemy between `STAND_OFF` and `ENGAGE`
 *     so auto-fire stays in range, back off before contact, and inside the band
 *     strafe towards whichever side of the horde is emptiest.
 *
 * Pure function of the frame: it is a consumer of the render port, exactly
 * like the scene is, which is what lets the same policy drive a unit test and
 * a full headless round.
 */
export const engage = (frame: WorldFrame): Vec2 => {
  const player = frame.player;

  // 1. re-arm
  let bullet: { x: number; y: number } | null = null;
  let bulletSq = Infinity;
  for (const candidate of frame.bullets) {
    if (candidate.state !== 'ground') continue;
    const dx = candidate.x - player.x;
    const dy = candidate.y - player.y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bulletSq) {
      bulletSq = dSq;
      bullet = candidate;
    }
  }
  if (frame.held === 0 && bullet) return unit(bullet.x - player.x, bullet.y - player.y);

  // 2. hold the line
  let threat: { x: number; y: number } | null = null;
  let threatSq = Infinity;
  let ax = 0;
  let ay = 0;
  for (const enemy of frame.enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dSq = dx * dx + dy * dy;
    if (dSq < threatSq) {
      threatSq = dSq;
      threat = enemy;
    }
    const d = Math.sqrt(dSq) || 1;
    const weight = 1 / (d * d);
    ax += (dx / d) * weight;
    ay += (dy / d) * weight;
  }
  if (!threat || !Number.isFinite(threatSq)) return IDLE;

  const distance = Math.sqrt(threatSq);
  if (distance < STAND_OFF) return unit(-ax, -ay);
  if (distance > ENGAGE) return unit(threat.x - player.x, threat.y - player.y);

  const toward = unit(threat.x - player.x, threat.y - player.y);
  const left: Vec2 = { x: toward.y, y: -toward.x };
  const right: Vec2 = { x: -toward.y, y: toward.x };
  const crowd = (dir: Vec2): number => {
    let score = 0;
    for (const enemy of frame.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      if ((dx / d) * dir.x + (dy / d) * dir.y > 0.5) score += 1 / d;
    }
    return score;
  };
  return crowd(left) <= crowd(right) ? left : right;
};
