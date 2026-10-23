/**
 * GameSession — the domain-side orchestrator.
 *
 * Composes the world, power-ups, DDA, scoring and the round machine, and runs
 * the fixed-timestep simulation with anti-tunneling sub-steps. It knows only
 * ports (RandomPort, ClockPort, EventSinkPort) and its own subsystems — no
 * Phaser, no DOM, no pixels. The Phaser scene drives it and renders snapshots.
 */

import {
    BASE_BALL_SPEED, BRICK_POINTS, FIXED_STEP, MAX_BALL_SPEED,
    PADDLE_WIDTH, START_BALLS, WAVE_COUNT, WORLD_WIDTH,
} from './config.ts';
import { DdaController } from './dda/DdaController.ts';
import { bounceWalls, circleVsRect, paddleBounce, reflect, separate } from './physics/Collision.ts';
import { RoundStateMachine, type RoundSignal } from './round/RoundStateMachine.ts';
import { ScoreSystem } from './score/ScoreSystem.ts';
import { PowerUpSystem } from './powerups/PowerUpSystem.ts';
import { WaveGenerator } from './bricks/WaveGenerator.ts';
import { GameWorld } from './world/GameWorld.ts';
import type { ClockPort, EventSinkPort, RandomPort } from './ports.ts';
import type { Ball, DomainEvent, WorldSnapshot } from './types.ts';

/** Design target for clearing one wave, in seconds (used by the DDA). */
const WAVE_TARGET_SECONDS = 45;
/** A ball drop counts as a "near miss" if it lands within this distance of the paddle edge. */
const NEAR_MISS_UNITS = 4;
/** Max seconds absorbed per update call, so a stalled tab cannot teleport the ball. */
const MAX_FRAME_SECONDS = 0.25;

export class GameSession {
    readonly world: GameWorld;
    readonly powerUps: PowerUpSystem;
    readonly score: ScoreSystem;
    readonly dda: DdaController;
    readonly round: RoundStateMachine;

    private readonly waves: WaveGenerator;
    private accumulator = 0;
    private waveStartMs = 0;
    private lastBrickHitMs = 0;
    private cleanStreak = false;      // no ball lost since the wave began
    private servedThisPhase = false;  // ball already spawned for the current 'playing' entry
    /** Balls about to launch at round start (serving phase shows this in the HUD). */
    private pendingServeCount = 0;
    private currentBallSpeedMul = 1;  // smoothed towards the DDA target, in-wave
    private currentPaddleWidth = PADDLE_WIDTH; // likewise for the paddle

    private readonly clock: ClockPort;
    private readonly sink: EventSinkPort;

    constructor(
        random: RandomPort,
        clock: ClockPort,
        sink: EventSinkPort,
        dda?: DdaController,
    ) {
        this.clock = clock;
        this.sink = sink;
        this.world = new GameWorld(random);
        this.powerUps = new PowerUpSystem(random);
        this.score = new ScoreSystem();
        // The DDA may be handed in so it survives retries within the session.
        this.dda = dda ?? new DdaController(clock);
        this.round = new RoundStateMachine(clock);
        this.waves = new WaveGenerator(random);

        // Power-up events reach the session only through this listener —
        // PowerUpSystem never sees the world, DDA or round machine.
        this.powerUps.setEventListener((e) => {
            if (e.type === 'missed') {
                this.dda.onDropResult(false);
                return;
            }
            this.onPowerUpCaught(e.kind);
        });
    }

    /** Prepare and start a round. `height` is the world height in world units. */
    start(height: number): void {
        this.world.reset(height);
        this.powerUps.reset();
        this.score.reset();
        this.currentBallSpeedMul = this.dda.params.ballSpeedMul;
        this.currentPaddleWidth = PADDLE_WIDTH;
        this.world.setBricks(this.waves.generate(1, height, this.dda.params.brickToughShareMul));
        this.cleanStreak = true;
        this.servedThisPhase = false;
        this.pendingServeCount = START_BALLS;
        this.waveStartMs = this.clock.now();
        this.lastBrickHitMs = this.waveStartMs;
        this.dispatch(this.round.start(this.dda.params.serveSeconds));
    }

    /** Input: the paddle target X in world units (already converted from screen space). */
    setPaddleTargetX(worldX: number): void {
        this.world.paddleTargetX = Math.max(0, Math.min(WORLD_WIDTH, worldX));
    }

    /** The window aspect changed mid-round: adopt the new world height (§9, any height). */
    resize(height: number): void {
        this.world.resizeWorld(height);
    }

    /**
     * Advance the simulation by `dtSeconds`. Internally the logic runs at a
     * fixed 120 Hz; fast balls are additionally sub-stepped so they cannot
     * tunnel through bricks or the paddle.
     */
    update(dtSeconds: number): void {
        if (this.round.phase === 'idle' || this.round.phase === 'ended') return;

        this.dispatch(this.round.update());

        // Smooth the DDA ball speed and paddle width so in-wave changes are
        // gradual (§7.3): brick layouts change only between waves, but speed
        // and paddle ease towards their new targets.
        const targetMul = this.dda.params.ballSpeedMul * this.powerUps.ballSpeedMul();
        this.currentBallSpeedMul += (targetMul - this.currentBallSpeedMul) * Math.min(1, dtSeconds * 2);
        const targetPaddle = PADDLE_WIDTH * this.dda.params.paddleWidthMul * this.powerUps.paddleWidthMul();
        this.currentPaddleWidth += (targetPaddle - this.currentPaddleWidth) * Math.min(1, dtSeconds * 3);
        this.world.setPaddleWidth(this.currentPaddleWidth);

        this.accumulator += Math.min(dtSeconds, MAX_FRAME_SECONDS);
        while (this.accumulator >= FIXED_STEP) {
            this.accumulator -= FIXED_STEP;
            this.step(FIXED_STEP);
        }

        this.dda.update();
    }

    /** Read-only view for the renderer. */
    snapshot(): WorldSnapshot {
        return {
            width: this.world.width,
            height: this.world.height,
            shieldY: this.world.shieldY,
            paddle: { ...this.world.paddle },
            balls: this.world.balls.filter((b) => b.alive).map((b) => ({ x: b.x, y: b.y, r: b.r })),
            bricks: this.world.bricks
                .filter((b) => b.hp > 0)
                .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp, maxHp: b.maxHp, kind: b.kind })),
            drops: this.powerUps.liveDrops.map((d) => ({ x: d.x, y: d.y, kind: d.kind })),
            shieldActive: this.powerUps.hasShield(),
            ballCount: this.round.phase === 'serving'
                ? this.pendingServeCount
                : this.world.aliveBalls,
            score: this.score.score,
            wave: this.round.wave,
            combo: this.score.comboMultiplier,
            phase: this.round.phase,
            timerSeconds: this.round.timerSeconds,
            fireball: this.powerUps.isFireball(),
        };
    }

    // ---- one fixed logic step ----

    private step(dt: number): void {
        this.world.stepPaddle();

        if (this.round.phase === 'serving') return; // ball not in play yet

        if (this.round.phase === 'playing' && !this.servedThisPhase) {
            this.servedThisPhase = true;
            this.pendingServeCount = 0; // now genuinely in flight
            this.world.serveVolley(this.currentBallSpeedMul);
        }

        if (this.round.phase !== 'playing') return; // banner: balls frozen

        this.powerUps.update(dt, this.world.paddle, this.world.height);
        this.moveBalls(dt);
        this.world.compactBalls();
    }

    private moveBalls(dt: number): void {
        const fireball = this.powerUps.isFireball();
        for (const ball of this.world.balls) {
            if (!ball.alive) continue;

            // Anti-tunneling: split the movement so no sub-step exceeds the ball radius.
            const speed = Math.hypot(ball.vx, ball.vy);
            const subSteps = Math.max(1, Math.min(8, Math.ceil((speed * dt) / (ball.r * 0.9))));
            const subDt = dt / subSteps;

            for (let s = 0; s < subSteps && ball.alive; s++) {
                ball.x += ball.vx * subDt;
                ball.y += ball.vy * subDt;
                bounceWalls(ball, this.world.width, this.world.height);
                this.hitPaddle(ball);
                this.hitBricks(ball, fireball);
                if (!fireball) this.hitShieldOrDie(ball);
                else if (ball.y - ball.r > this.world.height) this.hitShieldOrDie(ball);
            }
        }
    }

    private hitPaddle(ball: Ball): void {
        if (ball.vy <= 0) return;
        const hit = circleVsRect(ball, this.world.paddle);
        if (!hit.hit) return;
        separate(ball, hit);
        paddleBounce(ball, this.world.paddle);
        this.score.breakCombo();
        this.sink.emit({ type: 'paddleHit' });
    }

    private hitBricks(ball: Ball, fireball: boolean): void {
        for (const brick of this.world.bricks) {
            if (brick.hp <= 0) continue;
            const hit = circleVsRect(ball, brick);
            if (!hit.hit) continue;

            // Rally tracking: time since the previous brick hit.
            const now = this.clock.now();
            this.dda.onRally((now - this.lastBrickHitMs) / 1000);
            this.lastBrickHitMs = now;

            brick.hp--;
            const destroyed = brick.hp <= 0;

            if (!fireball) {
                separate(ball, hit);
                reflect(ball, hit.nx, hit.ny);
            }

            // The combo chain grows on every consecutive brick hit (§8), not
            // only on destroys — a 2-hp brick hit twice counts twice.
            this.score.onBrickHit();

            if (destroyed) {
                const awarded = this.score.addBrick(this.pointsFor(brick.kind));
                if (this.cleanStreak) this.dda.onCleanBrick();
                this.powerUps.maybeSpawn(
                    brick.x, brick.y,
                    this.dda.params.dropChance,
                    this.dda.params.shrinkWeight,
                );
                this.sink.emit({ type: 'brickHit', x: hit.px, y: hit.py, destroyed: true, points: awarded });
            } else {
                this.sink.emit({ type: 'brickHit', x: hit.px, y: hit.py, destroyed: false, points: 0 });
            }

            if (this.world.remainingBricks === 0) this.onWaveCleared();
            return; // one brick per sub-step keeps collisions stable
        }
    }

    private hitShieldOrDie(ball: Ball): void {
        if (ball.y - ball.r <= this.world.height) return;

        // A charged shield saves the ball once — bounce it back up.
        if (this.powerUps.consumeShield()) {
            ball.y = this.world.shieldY - ball.r;
            ball.vy = -Math.abs(ball.vy);
            this.sink.emit({ type: 'ballSaved' });
            return;
        }

        // The ball is gone for good — there are no extra lives (Ballz rule).
        ball.alive = false;

        // Near miss: the ball fell close to the paddle edge — a struggle tell.
        const edgeDist = Math.abs(ball.x - this.world.paddle.x) - this.world.paddle.w / 2;
        if (edgeDist < NEAR_MISS_UNITS) this.dda.onNearMiss();

        this.cleanStreak = false;
        this.dda.onBallLost();
        this.sink.emit({ type: 'ballLost', ballsLeft: this.world.aliveBalls });
        this.score.breakCombo();

        // Out of balls: the round is over. Other balls, if any, keep playing.
        if (this.world.aliveBalls === 0) {
            this.dispatch(this.round.lost());
        }
    }

    private onWaveCleared(): void {
        const elapsed = (this.clock.now() - this.waveStartMs) / 1000;
        this.dda.onWaveCleared(WAVE_TARGET_SECONDS, elapsed);
        const bonus = this.score.addWaveBonus(this.world.aliveBalls);
        this.sink.emit({ type: 'waveCleared', wave: this.round.wave, bonus });

        const signals = this.round.waveCleared();
        if (signals.length === 0) return;
        this.dispatch(signals);

        // The last wave ends the round (win) — nothing to generate.
        if (this.round.phase === 'ended') return;

        // Next wave: bricks are laid out during the banner, using the DDA's
        // updated Tough/Sturdy share; balls stay frozen until the banner ends.
        this.world.setBricks(this.waves.generate(
            Math.min(this.round.wave + 1, WAVE_COUNT),
            this.world.height,
            this.dda.params.brickToughShareMul,
        ));
        this.cleanStreak = true;
        this.waveStartMs = this.clock.now();
        this.lastBrickHitMs = this.waveStartMs;
    }

    private onPowerUpCaught(kind: Parameters<PowerUpSystem['apply']>[0]): void {
        this.dda.onDropResult(true);
        this.score.addPowerUp();

        if (kind === 'multi') {
            // The heart of the game: a caught pickup permanently adds a ball
            // to the volley. It launches from the paddle straight away, fanned
            // so it does not perfectly shadow an existing ball.
            const speed = Math.min(
                BASE_BALL_SPEED * this.currentBallSpeedMul,
                MAX_BALL_SPEED,
            );
            const spawn = this.powerUps.multiSpawn(this.world.paddle, speed, this.world.balls.length);
            if (!this.world.addBall(spawn)) {
                // Volley already at the MAX_BALLS cap — don't waste the pickup.
                this.score.addPowerUp();
            }
        } else {
            this.powerUps.apply(kind);
        }
        this.sink.emit({ type: 'powerUpCollected', kind });
    }

    private pointsFor(kind: 'basic' | 'sturdy' | 'tough'): number {
        return BRICK_POINTS[kind];
    }

    private dispatch(signals: RoundSignal[]): void {
        for (const s of signals) {
            switch (s.type) {
                case 'roundStarted':
                    this.sink.emit({ type: 'roundStarted', wave: s.wave });
                    break;
                case 'waveBanner':
                    this.sink.emit({ type: 'waveBanner', wave: s.wave });
                    break;
                case 'waveStarted':
                    this.sink.emit({ type: 'waveStarted', wave: s.wave });
                    break;
                case 'roundEnded': {
                    // Wave-clear bonus already counted; final score is read here.
                    const ev: DomainEvent = { type: 'roundEnded', win: s.win, score: this.score.score };
                    this.sink.emit(ev);
                    break;
                }
            }
        }
    }
}
