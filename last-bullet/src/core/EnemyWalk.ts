import { CONTACT_SINK, CROWD_PRESSURE, PLAYER_RADIUS, SEPARATION_PASSES } from './config.ts';
import type { CrowdField } from './CrowdField.ts';
import { MAX_ENEMY_RADIUS, type Enemy, type EnemyPool } from './entities.ts';
import { pushApart, pushOutOfPlayer } from './geometry.ts';

/**
 * How the horde moves: the homing walk, the room it is allowed to take, and
 * the separation passes that keep solid bodies from sharing a place.
 *
 * The walk answers one question per body - "how far may I go this step" - and
 * the settlement answers another: "given where everyone ended up, undo every
 * overlap". Both read the field, which `GameWorld` rebuilds around them, and
 * neither knows anything about the player beyond the two coordinates it is
 * handed: damage, killing and scoring are other people's business.
 */
export class EnemyWalk {
  /** Candidate buffer, reused across queries so a step allocates nothing. */
  private readonly candidates: number[] = [];
  private readonly pool: EnemyPool;
  private readonly field: CrowdField;

  constructor(pool: EnemyPool, field: CrowdField) {
    this.pool = pool;
    this.field = field;
  }

  /**
   * One homing step for every live body, towards `(px, py)` at `(dx, dy)` of
   * travel. Erratic runners sway on top of the homing vector; everybody is
   * capped by the room actually left ahead, not just by the clock, so a
   * zombie walks into the crowd rather than through it.
   */
  step(dt: number, px: number, py: number): void {
    const bodies = this.pool.items;
    for (let i = 0; i < bodies.length; i++) {
      const enemy = bodies[i];
      if (!enemy.alive) continue;

      const dx = px - enemy.x;
      const dy = py - enemy.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      let ux = dx / d;
      let uy = dy / d;

      if (enemy.kind === 'fast') {
        // Erratic wobble: a perpendicular sway on top of the homing vector.
        enemy.wobble += dt * 7;
        const sway = Math.sin(enemy.wobble) * 0.6;
        const hx = ux - uy * sway;
        const hy = uy + ux * sway;
        const n = Math.sqrt(hx * hx + hy * hy) || 1;
        ux = hx / n;
        uy = hy / n;
      }

      // Capped by the room actually left ahead, not just by the clock.
      const wanted = enemy.speed * dt;
      const step = Math.min(wanted, this.freeStep(enemy, ux, uy, wanted, px, py));
      enemy.x += ux * step;
      enemy.y += uy * step;
      if (enemy.hit > 0) enemy.hit = Math.max(0, enemy.hit - dt);
    }
  }

  /**
   * Solid bodies: no two zombies may stand in the same place, and none may
   * stand inside the player. Each pass walks the live pool, asks the field for
   * the neighbours around it and splits any overlap down the middle - both
   * give ground - while the player, who never gives ground, simply sheds the
   * zombie out to the edge of its own circle.
   *
   * The corrections are positional rather than velocity-based on purpose:
   * they are constraints, so they do not care how long the step was, and
   * nothing accumulates between steps. The homing walk will always push the
   * crowd back together, which is exactly what makes a horde look like it is
   * jostling through itself instead of clipping into one another.
   *
   * Runs between two field rebuilds - see `GameWorld.step`.
   */
  settle(px: number, py: number): void {
    const bodies = this.pool.items;
    const list = this.candidates;

    for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (!a.alive) continue;

        list.length = 0;
        // One body width of slack on top of the contact radius: a correction
        // earlier in this pass may have moved a body by at most that much,
        // and the field still has it in the cell it moved out of.
        this.field.queryCircle(a.x, a.y, a.radius + 2 * MAX_ENEMY_RADIUS, list);

        for (let n = 0; n < list.length; n++) {
          const j = list[n];
          if (j <= i) continue; // settled together when the lower id was read
          const b = bodies[j];
          if (!b.alive) continue;
          pushApart(a, b, i, j);
        }

        pushOutOfPlayer(a, px, py);
      }
    }
  }

  /**
   * Second Wind's shove: everything within `reach` of `(x, y)` is set down on
   * the rim, clearing the space the revived survivor is standing in.
   */
  repelFrom(x: number, y: number, reach: number): void {
    const bodies = this.pool.items;
    for (let i = 0; i < bodies.length; i++) {
      const enemy = bodies[i];
      if (!enemy.alive) continue;

      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d >= reach) continue;
      enemy.x = x + (dx / d) * reach;
      enemy.y = y + (dy / d) * reach;
    }
  }

  /**
   * How far `enemy` may still travel along `(ux, uy)` before it would force
   * itself into whoever stands in the way: the survivor, who is a fixed body,
   * and any zombie whose body overlaps the path. The crowd's answer gets
   * `CROWD_PRESSURE` added so the horde keeps leaning on itself instead of
   * locking into a wall; the survivor's does not - the caller caps the result
   * at full speed.
   *
   * The field answering here was rebuilt before the walk, so a neighbour that
   * has already stepped this frame reads up to one step out of date; the
   * query is padded by that same step so nobody is missed.
   */
  private freeStep(
    enemy: Enemy,
    ux: number,
    uy: number,
    wanted: number,
    px: number,
    py: number,
  ): number {
    const list = this.candidates;
    list.length = 0;
    this.field.queryCircle(enemy.x, enemy.y, enemy.radius + MAX_ENEMY_RADIUS + wanted, list);

    // Room left by the crowd: `CROWD_PRESSURE` is added to it, so the horde
    // keeps leaning on whoever is ahead instead of locking into a wall.
    let room = wanted;
    // Room left by the survivor: exact, never leaned on. They are a fixed
    // body, and the front rank holding them still is what lets the rest of
    // the crowd spread sideways instead of piling into the rank in front.
    let against = wanted;

    const bodies = this.pool.items;
    const reach = enemy.radius + PLAYER_RADIUS - CONTACT_SINK;
    const dx = px - enemy.x;
    const dy = py - enemy.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const towardPlayer = (dx * ux + dy * uy) / d;
    // Already inside the survivor counts as no room at all: they may not walk
    // further in, the separation pass is what puts them back out.
    if (towardPlayer > 0.01) against = Math.max(0, (d - reach) / towardPlayer);

    for (let n = 0; n < list.length; n++) {
      const other = bodies[list[n]];
      if (other === enemy || !other.alive) continue;

      const ox = other.x - enemy.x;
      const oy = other.y - enemy.y;
      const reachOther = enemy.radius + other.radius;
      const oSq = ox * ox + oy * oy;
      if (oSq <= reachOther * reachOther) {
        room = 0; // shoulder to shoulder already: press, do not part
        continue;
      }

      const od = Math.sqrt(oSq);
      const ahead = (ox * ux + oy * uy) / od;
      // Beside or behind is not in the way: a shoulder to shoulder neighbour
      // must not stall the walk, only one standing in the path may.
      if (ahead <= 0.01) continue;
      if (od <= reachOther) {
        room = 0; // already in the way: press, do not part
        continue;
      }
      const space = (od - reachOther) / ahead;
      if (space < room) room = space;
    }

    return Math.min(room + CROWD_PRESSURE, against);
  }
}
