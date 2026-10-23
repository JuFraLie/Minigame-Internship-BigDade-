/**
 * Weighted power-up drops, effects, timers and the ball cap.
 *
 * Talks to the rest of the game only through its own typed events and the
 * arguments handed to it — it knows nothing about GameWorld, the DDA or the
 * round state machine.
 */

import { BALL_RADIUS, DROP_FALL_SPEED, DROP_WEIGHTS } from '../config.ts';
import type { RandomPort } from '../ports.ts';
import type { Drop, PowerUpKind, Rect } from '../types.ts';

/** A ball to be created by the owner of the ball list (GameWorld assigns ids). */
export interface BallSpawn {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
}

export type PowerUpEvent =
    | { type: 'caught'; kind: PowerUpKind; x: number; y: number }
    | { type: 'missed'; kind: PowerUpKind };

/** Timed paddle/wall effects currently active. */
interface ActiveTimers {
    /** Remaining seconds of the slow-ball effect (0 = off). */
    slow: number;
    /** Remaining seconds of the fireball effect (0 = off). */
    fire: number;
    /** Paddle-size effect: which one and its remaining seconds. */
    paddleEffect: 'none' | 'wide' | 'shrink';
    paddleTimer: number;
}

const TIMER_SECONDS: Record<'slow' | 'fire' | 'wide' | 'shrink', number> = {
    slow: 12,
    fire: 8,
    wide: 15,
    shrink: 8,
};

const WIDE_MUL = 1.5;
const SHRINK_MUL = 0.75;
const SLOW_MUL = 0.65;

export class PowerUpSystem {
    private readonly drops: Drop[] = [];
    private readonly timers: ActiveTimers = { slow: 0, fire: 0, paddleEffect: 'none', paddleTimer: 0 };
    private readonly random: RandomPort;
    private shieldCharge = false;
    private nextId = 1;
    private onEvent: (e: PowerUpEvent) => void = () => {};

    constructor(random: RandomPort) {
        this.random = random;
    }

    /** The session registers the single listener that routes events onward. */
    setEventListener(fn: (e: PowerUpEvent) => void): void {
        this.onEvent = fn;
    }

    reset(): void {
        this.drops.length = 0;
        this.timers.slow = 0;
        this.timers.fire = 0;
        this.timers.paddleEffect = 'none';
        this.timers.paddleTimer = 0;
        this.shieldCharge = false;
    }

    /**
     * Roll a drop for a destroyed brick. `dropChance` and `shrinkWeight` come
     * from the DDA; the rest of the weights are fixed (see config).
     */
    maybeSpawn(brickX: number, brickY: number, dropChance: number, shrinkWeight: number): void {
        if (this.random.next() >= dropChance) return;

        const weights: Record<PowerUpKind, number> = { ...DROP_WEIGHTS, shrink: shrinkWeight };
        const total = (Object.keys(weights) as PowerUpKind[]).reduce((sum, k) => sum + weights[k], 0);
        if (total <= 0) return;

        let roll = this.random.next() * total;
        let kind: PowerUpKind = 'multi';
        for (const k of Object.keys(weights) as PowerUpKind[]) {
            roll -= weights[k];
            if (roll < 0) { kind = k; break; }
        }

        this.drops.push({ id: this.nextId++, kind, x: brickX, y: brickY, vy: DROP_FALL_SPEED, alive: true });
    }

    /** Advance drops; detect paddle catches and floor misses. */
    update(dt: number, paddle: Rect, worldHeight: number): void {
        this.tickTimers(dt);

        for (const d of this.drops) {
            if (!d.alive) continue;
            d.y += d.vy * dt;

            if (this.overlapsPaddle(d, paddle)) {
                d.alive = false;
                this.onEvent({ type: 'caught', kind: d.kind, x: d.x, y: d.y });
            } else if (d.y - 1 > worldHeight) {
                d.alive = false;
                this.onEvent({ type: 'missed', kind: d.kind });
            }
        }
        this.compact();
    }

    /**
     * Compute the spawn for a caught "+1 ball" pickup: one extra ball joins
     * the volley, launched from the paddle with a slight fan so it does not
     * perfectly shadow an existing ball. Pure calculation — the caller
     * (GameWorld) assigns ids and owns the list.
     */
    multiSpawn(paddle: { x: number; y: number; w: number; h: number }, speed: number, index: number): BallSpawn {
        const fan = ((index % 3) - 1) * 0.35; // -0.35, 0, +0.35 radians
        return {
            x: paddle.x,
            y: paddle.y - paddle.h / 2 - BALL_RADIUS - 0.1,
            vx: Math.sin(fan) * speed,
            vy: -Math.cos(fan) * speed,
            r: BALL_RADIUS,
        };
    }

    apply(kind: PowerUpKind): void {
        switch (kind) {
            case 'multi':
                break; // handled by the session (owns the ball stock)
            case 'wide':
                this.timers.paddleEffect = 'wide';
                this.timers.paddleTimer = TIMER_SECONDS.wide;
                break;
            case 'shrink':
                this.timers.paddleEffect = 'shrink';
                this.timers.paddleTimer = TIMER_SECONDS.shrink;
                break;
            case 'slow':
                this.timers.slow = TIMER_SECONDS.slow;
                break;
            case 'fire':
                this.timers.fire = TIMER_SECONDS.fire;
                break;
            case 'shield':
                this.shieldCharge = true;
                break;
        }
    }

    /** Consume the shield if charged. Returns true when a ball was saved. */
    consumeShield(): boolean {
        if (!this.shieldCharge) return false;
        this.shieldCharge = false;
        return true;
    }

    hasShield(): boolean { return this.shieldCharge; }
    isFireball(): boolean { return this.timers.fire > 0; }
    isSlow(): boolean { return this.timers.slow > 0; }
    ballSpeedMul(): number { return this.timers.slow > 0 ? SLOW_MUL : 1; }

    paddleWidthMul(): number {
        if (this.timers.paddleEffect === 'wide') return WIDE_MUL;
        if (this.timers.paddleEffect === 'shrink') return SHRINK_MUL;
        return 1;
    }

    get liveDrops(): readonly Drop[] { return this.drops; }

    private tickTimers(dt: number): void {
        this.timers.slow = Math.max(0, this.timers.slow - dt);
        this.timers.fire = Math.max(0, this.timers.fire - dt);
        if (this.timers.paddleTimer > 0) {
            this.timers.paddleTimer = Math.max(0, this.timers.paddleTimer - dt);
            if (this.timers.paddleTimer === 0) this.timers.paddleEffect = 'none';
        }
    }

    private overlapsPaddle(d: Drop, paddle: Rect): boolean {
        const halfW = paddle.w / 2 + 1.5;
        const halfH = paddle.h / 2 + 1.5;
        return Math.abs(d.x - paddle.x) <= halfW && Math.abs(d.y - paddle.y) <= halfH;
    }

    /** In-place compaction — no allocation inside the game loop. */
    private compact(): void {
        let write = 0;
        for (let read = 0; read < this.drops.length; read++) {
            const d = this.drops[read];
            if (d.alive) this.drops[write++] = d;
        }
        this.drops.length = write;
    }
}
