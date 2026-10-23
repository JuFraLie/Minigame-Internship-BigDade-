/**
 * The game world in world units: paddle, balls, bricks, drops, ball stock.
 * Knows nothing about rendering, the DDA, or the bridge.
 */

import {
    BASE_BALL_SPEED, BALL_RADIUS, MAX_BALLS, MAX_BALL_SPEED, PADDLE_BOTTOM_MARGIN,
    PADDLE_HEIGHT, PADDLE_WIDTH, SHIELD_Y_FRAC, START_BALLS, WORLD_WIDTH,
} from '../config.ts';
import type { RandomPort } from '../ports.ts';
import type { Ball, Brick, Rect } from '../types.ts';

export class GameWorld {
    private readonly random: RandomPort;

    constructor(random: RandomPort) {
        this.random = random;
    }

    readonly width = WORLD_WIDTH;
    height = 200; // replaced in reset() from the real screen aspect

    readonly paddle: Rect = { x: WORLD_WIDTH / 2, y: 0, w: PADDLE_WIDTH, h: PADDLE_HEIGHT };
    /** Target paddle centre X (world units), set by input; the paddle eases towards it. */
    paddleTargetX = WORLD_WIDTH / 2;

    readonly balls: Ball[] = [];
    bricks: Brick[] = [];

    /** The shield line Y (world units); a charged shield saves one ball here. */
    shieldY = 0; // set from SHIELD_Y_FRAC in reset

    private nextBallId = 1;
    /** Effective paddle width after DDA + power-up multipliers (clamped to hard bounds). */
    private effectivePaddleWidth = PADDLE_WIDTH;

    reset(height: number): void {
        this.height = height;
        this.shieldY = height * SHIELD_Y_FRAC;
        this.paddle.y = height - PADDLE_BOTTOM_MARGIN;
        this.paddle.x = WORLD_WIDTH / 2;
        this.paddleTargetX = WORLD_WIDTH / 2;
        this.effectivePaddleWidth = PADDLE_WIDTH;
        this.paddle.w = PADDLE_WIDTH;
        this.balls.length = 0;
        this.bricks = [];
    }

    /**
     * Adopt a new world height mid-round (the window aspect changed: URL bar
     * collapsed, split screen, rotation). Only vertical anchors move — the
     * paddle, shield line and anything in flight are clamped, never lost.
     */
    resizeWorld(height: number): void {
        this.height = height;
        this.shieldY = height * SHIELD_Y_FRAC;
        this.paddle.y = height - PADDLE_BOTTOM_MARGIN;
        const half = this.paddle.w / 2;
        this.paddle.x = Math.max(half, Math.min(this.width - half, this.paddle.x));
        this.paddleTargetX = Math.max(half, Math.min(this.width - half, this.paddleTargetX));
        for (const b of this.balls) {
            b.y = Math.max(b.r, Math.min(height - b.r, b.y));
        }
    }

    setBricks(bricks: Brick[]): void {
        this.bricks = bricks;
    }

    get remainingBricks(): number {
        let n = 0;
        for (const b of this.bricks) if (b.hp > 0) n++;
        return n;
    }

    get aliveBalls(): number {
        let n = 0;
        for (const b of this.balls) if (b.alive) n++;
        return n;
    }

    /** Set the paddle width after all multipliers (DDA x power-up); clamped to hard bounds. */
    setPaddleWidth(width: number): void {
        this.effectivePaddleWidth = Math.max(9, Math.min(26, width));
        this.paddle.w = this.effectivePaddleWidth;
    }

    /** Move the paddle toward its target; returns the new centre X. */
    stepPaddle(): void {
        const half = this.paddle.w / 2;
        const target = Math.max(half, Math.min(this.width - half, this.paddleTargetX));
        // Snappy but not instant — a tiny smoothing keeps fast flicks readable.
        this.paddle.x += (target - this.paddle.x) * 0.55;
        if (Math.abs(this.paddle.x - target) < 0.05) this.paddle.x = target;
    }

    /**
     * Launch the round's opening volley (Ballz-style: START_BALLS at once).
     * The balls are stacked vertically above the paddle with a shared slight
     * lean, so they travel as a column and fan out the moment they start
     * hitting bricks. Later balls only ever join via "+1 ball" pickups.
     * Returns how many balls were launched.
     */
    serveVolley(speedMul: number): number {
        const speed = Math.min(BASE_BALL_SPEED * speedMul, MAX_BALL_SPEED);
        const count = START_BALLS;
        // Slight random lean so volleys are not perfectly vertical.
        const lean = (this.random.next() - 0.5) * speed * 0.2;
        const spacing = BALL_RADIUS * 2.2;
        for (let i = 0; i < count; i++) {
            this.balls.push({
                id: this.nextBallId++,
                x: this.paddle.x,
                y: this.paddle.y - this.paddle.h / 2 - BALL_RADIUS - 0.1 - i * spacing,
                vx: lean,
                vy: -speed,
                r: BALL_RADIUS,
                alive: true,
            });
        }
        return count;
    }

    /** Launch any number of extra balls (a "+1 ball" pickup); false when at the cap. */
    addBall(spawn: { x: number; y: number; vx: number; vy: number; r: number }): boolean {
        if (this.aliveBalls >= MAX_BALLS) return false;
        this.balls.push({ ...spawn, id: this.nextBallId++, alive: true });
        return true;
    }

    /** Rescale every live ball to the given speed (DDA / slow-ball changes apply mid-flight). */
    setBallSpeed(mul: number): void {
        const target = Math.min(BASE_BALL_SPEED * mul, MAX_BALL_SPEED);
        for (const b of this.balls) {
            if (!b.alive) continue;
            const cur = Math.hypot(b.vx, b.vy);
            if (cur < 0.001) { b.vy = -target; continue; }
            const scale = target / cur;
            b.vx *= scale;
            b.vy *= scale;
        }
    }

    /** Kill all live balls (used at round end / teardown). */
    killBalls(): void {
        for (const b of this.balls) b.alive = false;
    }

    /** In-place compaction of dead balls — no allocation inside the loop. */
    compactBalls(): void {
        let write = 0;
        for (let read = 0; read < this.balls.length; read++) {
            const b = this.balls[read];
            if (b.alive) this.balls[write++] = b;
        }
        this.balls.length = write;
    }
}
