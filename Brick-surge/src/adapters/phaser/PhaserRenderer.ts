/**
 * Phaser Canvas world renderer. Implements RendererPort.
 *
 * Draws the world half of a WorldSnapshot (world units, 100 wide): paddle,
 * shield, bricks, balls, drops and particles — pooled shapes plus the gradient
 * textures from ./theme.ts, no bundled image assets, no allocation inside the
 * frame loop. Particle bursts are small and capped to protect the frame rate
 * on the reference device class.
 *
 * The screen half (HUD text, banner, serve countdown) belongs to ./Hud.ts —
 * this class never touches it.
 */

import type Phaser from 'phaser';
import type { RendererPort } from '../../domain/ports.ts';
import type { BrickKind, WorldSnapshot } from '../../domain/types.ts';
import { BRICK_GAP, BRICK_H, BRICK_TOP_FRAC } from '../../domain/config.ts';
import { THEME } from './theme.ts';
import { renderScale, type Viewport } from './viewport.ts';

const MAX_BRICK_SPRITES = 96; // = MAX_BRICKS: the endless field's biggest wave
const MAX_BALL_SPRITES = 6;
const MAX_DROP_SPRITES = 10;
const MAX_PARTICLES = 24;

interface Particle {
    sprite: Phaser.GameObjects.Rectangle;
    vx: number;
    vy: number;
    life: number;
}

export class PhaserRenderer implements RendererPort {
    private scaleX = 1;
    private scaleY = 1;

    private readonly brickPool: Phaser.GameObjects.Rectangle[] = [];
    private readonly ballPool: Phaser.GameObjects.Arc[] = [];
    private readonly ballGlowPool: Phaser.GameObjects.Arc[] = [];
    private readonly dropPool: Phaser.GameObjects.Arc[] = [];
    private readonly particles: Particle[] = [];

    private paddle!: Phaser.GameObjects.Rectangle;
    private shieldLine!: Phaser.GameObjects.Rectangle;

    /** World height in world units — where the brick rows actually start. */
    private worldHeight = 100;

    /** Screen shake timer for ball-lost feedback (seconds remaining). */
    private shake = 0;

    private readonly scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** Backing-store density the camera zooms by — input conversion needs it. */
    get densityScale(): number {
        return renderScale();
    }

    create(viewport: Viewport): void {
        const s = this.scene;

        this.paddle = s.add.rectangle(0, 0, 10, 10, THEME.paddle).setOrigin(0.5);
        this.shieldLine = s.add.rectangle(0, 0, 10, 3, THEME.shield).setOrigin(0.5).setVisible(false);

        for (let i = 0; i < MAX_BRICK_SPRITES; i++) {
            this.brickPool.push(s.add.rectangle(0, 0, 10, 10, THEME.bricks.basic).setOrigin(0.5).setVisible(false));
        }
        // Soft halo first, so every glow sits behind its ball in the list.
        for (let i = 0; i < MAX_BALL_SPRITES; i++) {
            this.ballGlowPool.push(
                s.add.circle(0, 0, 1, THEME.ballGlow).setOrigin(0.5).setVisible(false).setAlpha(0.25),
            );
        }
        for (let i = 0; i < MAX_BALL_SPRITES; i++) {
            // A circle, not a diamond: round reads as a ball at any size.
            this.ballPool.push(s.add.circle(0, 0, 1, THEME.ball).setOrigin(0.5).setVisible(false));
        }
        for (let i = 0; i < MAX_DROP_SPRITES; i++) {
            // Pickups are round too — things you want to catch falling.
            this.dropPool.push(s.add.circle(0, 0, 1, 0xffffff).setOrigin(0.5).setVisible(false));
        }
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particles.push({
                sprite: s.add.rectangle(0, 0, 2, 2, 0xffffff).setOrigin(0.5).setVisible(false),
                vx: 0, vy: 0, life: 0,
            });
        }

        this.layout(viewport);
    }

    /**
     * Re-derive the world→screen scale for the given viewport (portrait, any
     * height) and refresh the brick-row colour sweep's idea of where the rows
     * are. HUD positioning lives in ./Hud.ts.
     */
    layout(viewport: Viewport): void {
        const { width, height } = viewport;
        // The world is always 100 units wide; its height follows the aspect ratio,
        // so both scales are simply width / 100.
        this.scaleX = width / 100;
        this.scaleY = width / 100;
        // Same formula the scene derives the session's world height from — the
        // brick row sweep below must agree with where the rows really are.
        this.worldHeight = 100 * (height / width);
    }

    /**
     * Brick destroyed: a small burst in the brick's own colour — the row sweep
     * comes from where the brick sits, exactly as it is drawn on screen.
     */
    burstBrick(worldX: number, worldY: number, kind: BrickKind): void {
        const color = this.brickBase(kind, worldY);
        let spawned = 0;
        for (const p of this.particles) {
            if (p.life > 0) continue;
            p.sprite.setPosition(worldX * this.scaleX, worldY * this.scaleY).setFillStyle(color).setVisible(true);
            const angle = (spawned / 6) * Math.PI * 2 + Math.random() * 0.6;
            const speed = 30 + Math.random() * 50;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = 0.35;
            if (++spawned >= 6) break; // capped burst — a few small particles only
        }
    }

    /** Life lost: a short screen shake. */
    triggerShake(): void {
        this.shake = 0.25;
    }

    render(snap: WorldSnapshot): void {
        const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);

        // --- paddle ---
        const px = snap.paddle.x * this.scaleX;
        const py = snap.paddle.y * this.scaleY;
        this.paddle.setPosition(px, py).setDisplaySize(snap.paddle.w * this.scaleX, snap.paddle.h * this.scaleY);

        // --- shield ---
        this.shieldLine.setVisible(snap.shieldActive);
        if (snap.shieldActive) {
            this.shieldLine.setPosition(50 * this.scaleX, snap.shieldY * this.scaleY)
                .setDisplaySize(100 * this.scaleX, 2);
        }

        // --- bricks ---
        for (let i = 0; i < this.brickPool.length; i++) {
            const sprite = this.brickPool[i];
            const b = i < snap.bricks.length ? snap.bricks[i] : undefined;
            if (!b) { sprite.setVisible(false); continue; }
            sprite.setVisible(true)
                .setPosition(b.x * this.scaleX, b.y * this.scaleY)
                .setDisplaySize(b.w * this.scaleX - 2, b.h * this.scaleY - 2)
                // Damaged bricks dim; multi-hp kinds shift colour after the first hit.
                .setFillStyle(this.brickColor(b.kind, b.y, b.hp, b.maxHp));
        }

        // --- balls ---
        for (let i = 0; i < this.ballPool.length; i++) {
            const sprite = this.ballPool[i];
            const glow = this.ballGlowPool[i];
            const b = i < snap.balls.length ? snap.balls[i] : undefined;
            if (!b) { sprite.setVisible(false); glow.setVisible(false); continue; }
            const x = b.x * this.scaleX;
            const y = b.y * this.scaleY;
            const diameter = b.r * 2;
            glow.setVisible(true)
                .setPosition(x, y)
                .setDisplaySize(diameter * 2.4 * this.scaleX, diameter * 2.4 * this.scaleY)
                .setFillStyle(snap.fireball ? THEME.fireballGlow : THEME.ballGlow);
            sprite.setVisible(true)
                .setPosition(x, y)
                .setDisplaySize(diameter * this.scaleX, diameter * this.scaleY)
                .setFillStyle(snap.fireball ? THEME.fireball : THEME.ball);
        }

        // --- drops ---
        for (let i = 0; i < this.dropPool.length; i++) {
            const sprite = this.dropPool[i];
            const d = i < snap.drops.length ? snap.drops[i] : undefined;
            if (!d) { sprite.setVisible(false); continue; }
            sprite.setVisible(true)
                .setPosition(d.x * this.scaleX, d.y * this.scaleY)
                .setDisplaySize(5 * this.scaleX, 5 * this.scaleY)
                .setFillStyle(THEME.drops[d.kind]);
        }

        // --- particles ---
        for (const p of this.particles) {
            if (p.life <= 0) { p.sprite.setVisible(false); continue; }
            p.life -= dt;
            p.vy += 200 * dt; // tiny gravity
            p.sprite.x += p.vx * dt;
            p.sprite.y += p.vy * dt;
            p.sprite.setAlpha(Math.max(0, p.life / 0.35));
            if (p.life <= 0) p.sprite.setVisible(false);
        }

        // --- screen shake ---
        if (this.shake > 0) {
            this.shake -= dt;
            const strength = 4 * this.scaleX;
            this.scene.cameras.main.setScroll(
                -(Math.random() - 0.5) * strength,
                -(Math.random() - 0.5) * strength,
            );
        } else {
            this.scene.cameras.main.setScroll(0, 0);
        }
    }

    /** Undamaged colour for a brick: the kind, swept by row for basics. */
    private brickBase(kind: BrickKind, y: number): number {
        if (kind === 'basic') {
            const rows = THEME.brickRows;
            const row = Math.round(
                (y - this.worldHeight * BRICK_TOP_FRAC - BRICK_H / 2) / (BRICK_H + BRICK_GAP),
            );
            const index = ((row % rows.length) + rows.length) % rows.length;
            return rows[index];
        }
        return THEME.bricks[kind];
    }

    private brickColor(kind: BrickKind, y: number, hp: number, maxHp: number): number {
        const base = this.brickBase(kind, y);
        if (hp >= maxHp) return base;
        // Dim towards grey as hp drops; a sturdy brick visibly changes colour.
        return this.mix(base, THEME.brickDamaged, (maxHp - hp) / maxHp);
    }

    private mix(a: number, b: number, t: number): number {
        const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
        const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl = Math.round(ab + (bb - ab) * t);
        return (r << 16) | (g << 8) | bl;
    }
}
