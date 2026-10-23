/** Collision math: ball vs brick, walls, and the paddle bounce angle. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
    bounceWalls, circleVsRect, paddleBounce, reflect, separate,
} from '../src/domain/physics/Collision.ts';
import type { Ball } from '../src/domain/types.ts';

const ball = (x: number, y: number, vx = 0, vy = -50, r = 1.6): Ball =>
    ({ id: 1, x, y, vx, vy, r, alive: true });

describe('circleVsRect', () => {
    it('misses when the ball is far away', () => {
        const hit = circleVsRect(ball(50, 50), { x: 10, y: 10, w: 10, h: 5 });
        assert.equal(hit.hit, false);
    });

    it('hits when the ball overlaps a brick edge', () => {
        // Brick spans x 45..55, y 20..25. Ball centre at (50, 23.5), r=1.6 → overlap.
        const hit = circleVsRect(ball(50, 23.5), { x: 50, y: 22.5, w: 10, h: 5 });
        assert.equal(hit.hit, true);
        assert.ok(hit.depth > 0);
    });

    it('reports an upward normal for a ball hitting the brick from above', () => {
        const hit = circleVsRect(ball(50, 23), { x: 50, y: 25, w: 10, h: 4 });
        assert.equal(hit.hit, true);
        assert.ok(hit.ny < 0, 'normal should point up (towards the ball)');
    });

    it('resolves a fully-inside ball along the shallowest axis', () => {
        // Ball centre inside the rect, closer to the top edge.
        const hit = circleVsRect(ball(50, 20.5), { x: 50, y: 25, w: 20, h: 10 });
        assert.equal(hit.hit, true);
        assert.equal(hit.ny, -1);
    });
});

describe('reflect', () => {
    it('reflects a downward ball off an upward normal', () => {
        const b = ball(0, 0, 10, -30);
        reflect(b, 0, -1);
        assert.equal(b.vx, 10);
        assert.equal(b.vy, 30);
    });
});

describe('separate', () => {
    it('pushes the ball out along the normal', () => {
        const b = ball(0, 0, 0, 0);
        separate(b, { hit: true, nx: 0, ny: -1, depth: 2, px: 0, py: 0 });
        assert.equal(b.y, -2);
    });
});

describe('bounceWalls', () => {
    it('bounces off the left wall', () => {
        const b = ball(0.5, 50, -40, -20);
        assert.equal(bounceWalls(b, 100, 200), true);
        assert.equal(b.vx, 40);
        assert.equal(b.x, b.r);
    });

    it('bounces off the right wall', () => {
        const b = ball(99.8, 50, 40, -20);
        assert.equal(bounceWalls(b, 100, 200), true);
        assert.equal(b.vx, -40);
    });

    it('bounces off the top wall', () => {
        const b = ball(50, 0.5, 10, -40);
        assert.equal(bounceWalls(b, 100, 200), true);
        assert.equal(b.vy, 40);
    });

    it('does nothing in open space', () => {
        const b = ball(50, 100, 10, 20);
        assert.equal(bounceWalls(b, 100, 200), false);
    });
});

describe('paddleBounce', () => {
    const paddle = { x: 50, y: 190, w: 16, h: 3 };

    it('sends a centre hit straight up', () => {
        const b = ball(50, 188, 0, 60);
        paddleBounce(b, paddle);
        assert.ok(Math.abs(b.vx) < 1e-9, 'centre hit must be vertical');
        assert.ok(b.vy < 0, 'ball must travel upwards');
    });

    it('angles an edge hit sideways but stays gentle (Ballz-style 45 deg cap)', () => {
        const b = ball(57.5, 188, 0, 60); // near the right edge
        paddleBounce(b, paddle);
        assert.ok(b.vx > 0, 'right-side hit goes right');
        // The steepest bounce is 45 deg from vertical, so |vy| is never below |vx|.
        assert.ok(Math.abs(b.vy) >= Math.abs(b.vx) - 1e-9, 'edge hit must stay at or under 45 degrees');
    });

    it('mirrors left and right edge hits', () => {
        const right = ball(57, 188, 0, 60);
        paddleBounce(right, paddle);
        const left = ball(43, 188, 0, 60);
        paddleBounce(left, paddle);
        assert.ok(right.vx > 0 && left.vx < 0);
        assert.ok(Math.abs(Math.abs(right.vx) - Math.abs(left.vx)) < 1e-9);
    });

    it('preserves ball speed', () => {
        const b = ball(54, 188, 0, 60);
        paddleBounce(b, paddle);
        assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 60) < 1e-9);
    });

    it('never returns a near-horizontal ball (angle correction)', () => {
        const b = ball(58, 188, 0, 60);
        paddleBounce(b, paddle);
        // |vy| must keep at least ~33% of total speed.
        assert.ok(Math.abs(b.vy) >= 0.3 * 60, `vy too flat: ${b.vy}`);
    });

    it('seats the ball above the paddle so it cannot re-collide', () => {
        const b = ball(50, 190, 0, 60);
        paddleBounce(b, paddle);
        assert.ok(b.y <= paddle.y - paddle.h / 2 - b.r);
    });
});
