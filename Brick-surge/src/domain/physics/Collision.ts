/**
 * Pure collision math in world units. No state, no Phaser — every function is
 * a free function so it can be unit-tested in isolation.
 */

import type { Ball, Rect } from '../types.ts';

export interface CircleRectHit {
    hit: boolean;
    /** Contact normal, pointing from the rectangle towards the ball centre. */
    nx: number;
    ny: number;
    /** Penetration depth in world units (>= 0 when hit). */
    depth: number;
    /** Contact point on the rectangle surface. */
    px: number;
    py: number;
}

const MISS: CircleRectHit = { hit: false, nx: 0, ny: 0, depth: 0, px: 0, py: 0 };

/** Circle (ball) vs axis-aligned rectangle (brick/paddle), x/y = centre. */
export function circleVsRect(ball: Ball, rect: Rect): CircleRectHit {
    const left = rect.x - rect.w / 2;
    const top = rect.y - rect.h / 2;
    const closestX = Math.max(left, Math.min(ball.x, left + rect.w));
    const closestY = Math.max(top, Math.min(ball.y, top + rect.h));
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq > ball.r * ball.r) return MISS;

    // Centre inside the rect: push out along the shallowest axis.
    if (distSq === 0) {
        const toLeft = ball.x - left;
        const toRight = left + rect.w - ball.x;
        const toTop = ball.y - top;
        const toBottom = top + rect.h - ball.y;
        const min = Math.min(toLeft, toRight, toTop, toBottom);
        if (min === toLeft) return { hit: true, nx: -1, ny: 0, depth: toLeft + ball.r, px: left, py: ball.y };
        if (min === toRight) return { hit: true, nx: 1, ny: 0, depth: toRight + ball.r, px: left + rect.w, py: ball.y };
        if (min === toTop) return { hit: true, nx: 0, ny: -1, depth: toTop + ball.r, px: ball.x, py: top };
        return { hit: true, nx: 0, ny: 1, depth: toBottom + ball.r, px: ball.x, py: top + rect.h };
    }

    const dist = Math.sqrt(distSq);
    return {
        hit: true,
        nx: dx / dist,
        ny: dy / dist,
        depth: ball.r - dist,
        px: closestX,
        py: closestY,
    };
}

/** Reflect the ball velocity across a unit normal (assumes normalised nx/ny). */
export function reflect(ball: Ball, nx: number, ny: number): void {
    const dot = ball.vx * nx + ball.vy * ny;
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;
}

/** Push the ball out of a rect along the contact normal by the penetration depth. */
export function separate(ball: Ball, hit: CircleRectHit): void {
    ball.x += hit.nx * hit.depth;
    ball.y += hit.ny * hit.depth;
}

/** Bounce off the left/right/top walls of a (0,0)-(width,height) world. Returns true on any bounce. */
export function bounceWalls(ball: Ball, width: number, height: number): boolean {
    let bounced = false;
    if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx);
        bounced = true;
    } else if (ball.x + ball.r > width) {
        ball.x = width - ball.r;
        ball.vx = -Math.abs(ball.vx);
        bounced = true;
    }
    if (ball.y - ball.r < 0) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy);
        bounced = true;
    }
    // The bottom is open — the ball either dies or is caught by the shield (handled by GameWorld).
    void height;
    return bounced;
}

/**
 * Bounce the ball off the paddle. The hit position maps to the bounce angle:
 * centre = straight up, edges = sharper. A minimum vertical component prevents
 * near-horizontal balls that would stall the game.
 *
 * maxTiltRad is the steepest allowed angle from vertical. Ballz-style tuning:
 * 45 deg keeps returns gentle and predictable instead of the classic
 * near-horizontal Breakout shot that is almost impossible to chase on touch.
 */
export function paddleBounce(ball: Ball, paddle: Rect, maxTiltRad = Math.PI / 4): void {
    const halfW = Math.max(paddle.w / 2, 0.0001);
    let offset = (ball.x - paddle.x) / halfW;          // -1 .. 1
    offset = Math.max(-1, Math.min(1, offset));

    const speed = Math.hypot(ball.vx, ball.vy) || 1;
    const tilt = offset * maxTiltRad;
    ball.vx = Math.sin(tilt) * speed;
    ball.vy = -Math.abs(Math.cos(tilt) * speed);

    // Angle correction: never flatter than ~35 deg from vertical.
    const minUp = Math.abs(Math.cos(Math.PI / 3.2)) * speed; // ~33 deg from vertical
    if (Math.abs(ball.vy) < minUp) {
        ball.vy = -minUp;
        const rest = Math.sqrt(Math.max(speed * speed - minUp * minUp, 0));
        ball.vx = (offset < 0 ? -1 : 1) * rest;
    }

    // Seat the ball on top of the paddle so it cannot re-collide next tick.
    ball.y = paddle.y - paddle.h / 2 - ball.r - 0.01;
}
