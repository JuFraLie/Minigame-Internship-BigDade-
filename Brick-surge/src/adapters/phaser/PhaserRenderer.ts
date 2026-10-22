/**
 * Phaser Canvas renderer. Implements RendererPort.
 *
 * Draws a WorldSnapshot (world units, 100 wide) onto the screen using pooled
 * sprites backed by tiny generated textures — no bundled image assets, no
 * allocation inside the frame loop. Particle bursts are small and capped to
 * protect the frame rate on the reference device class.
 */

import type Phaser from 'phaser';
import type { RendererPort } from '../../domain/ports.ts';
import type { PowerUpKind, WorldSnapshot } from '../../domain/types.ts';

const MAX_BRICK_SPRITES = 80;
const MAX_BALL_SPRITES = 6;
const MAX_DROP_SPRITES = 10;
const MAX_PARTICLES = 24;
/** Top of the screen reserved for the HUD (status bar / cutout safe area). */
const HUD_HEIGHT_FRAC = 0.08;

const DROP_COLORS: Record<PowerUpKind, number> = {
    multi: 0xffd23f,   // yellow — multi-ball
    wide: 0x4cd964,    // green — wide paddle
    slow: 0x5ac8fa,    // blue — slow ball
    fire: 0xff6b3d,    // orange — fireball
    shield: 0xaf52de,  // purple — shield
    life: 0xff2d55,    // red/pink — extra life
    shrink: 0x8e8e93,  // grey — the bad one
};

const BRICK_COLORS: Record<string, number> = {
    basic: 0x36a2eb,
    sturdy: 0x4cd964,
    tough: 0xff9500,
};

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
    private readonly ballPool: Phaser.GameObjects.Rectangle[] = [];
    private readonly dropPool: Phaser.GameObjects.Rectangle[] = [];
    private readonly particles: Particle[] = [];

    private paddle!: Phaser.GameObjects.Rectangle;
    private shieldLine!: Phaser.GameObjects.Rectangle;
    private scoreText!: Phaser.GameObjects.Text;
    private livesText!: Phaser.GameObjects.Text;
    private waveText!: Phaser.GameObjects.Text;
    private bannerText!: Phaser.GameObjects.Text;
    private serveText!: Phaser.GameObjects.Text;
    private comboText!: Phaser.GameObjects.Text;

    /** Screen shake timer for life-lost feedback (seconds remaining). */
    private shake = 0;

    private readonly scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(screenWidth: number, screenHeight: number): void {
        const s = this.scene;

        this.paddle = s.add.rectangle(0, 0, 10, 10, 0xf2f2f7).setOrigin(0.5);
        this.shieldLine = s.add.rectangle(0, 0, 10, 3, 0xaf52de).setOrigin(0.5).setVisible(false);

        for (let i = 0; i < MAX_BRICK_SPRITES; i++) {
            this.brickPool.push(s.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0.5).setVisible(false));
        }
        for (let i = 0; i < MAX_BALL_SPRITES; i++) {
            // A square rotated 45° reads as a diamond "ball" and costs no texture.
            this.ballPool.push(s.add.rectangle(0, 0, 6, 6, 0xffffff).setOrigin(0.5).setAngle(45).setVisible(false));
        }
        for (let i = 0; i < MAX_DROP_SPRITES; i++) {
            this.dropPool.push(s.add.rectangle(0, 0, 5, 5, 0xffffff).setOrigin(0.5).setVisible(false));
        }
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.particles.push({
                sprite: s.add.rectangle(0, 0, 2, 2, 0xffffff).setOrigin(0.5).setVisible(false),
                vx: 0, vy: 0, life: 0,
            });
        }

        const fontSize = Math.round(screenWidth * 0.045);
        const style: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: 'system-ui, sans-serif',
            color: '#ffffff',
            fontSize: `${fontSize}px`,
        };
        const hudY = screenHeight * HUD_HEIGHT_FRAC * 0.5;
        this.scoreText = s.add.text(screenWidth * 0.04, hudY, '0', style).setOrigin(0, 0.5);
        this.waveText = s.add.text(screenWidth * 0.5, hudY, 'Wave 1', style).setOrigin(0.5);
        this.livesText = s.add.text(screenWidth * 0.96, hudY, '♥ 3', style).setOrigin(1, 0.5);

        const bigStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            ...style,
            fontSize: `${Math.round(screenWidth * 0.09)}px`,
            fontStyle: 'bold',
        };
        this.bannerText = s.add.text(screenWidth * 0.5, screenHeight * 0.4, '', bigStyle)
            .setOrigin(0.5).setVisible(false);

        this.serveText = s.add.text(screenWidth * 0.5, screenHeight * 0.6, '', bigStyle)
            .setOrigin(0.5).setVisible(false);

        this.comboText = s.add.text(screenWidth * 0.5, screenHeight * 0.14, '', {
            ...style,
            fontSize: `${Math.round(screenWidth * 0.05)}px`,
            color: '#ffd23f',
        }).setOrigin(0.5).setVisible(false);

        this.resize(screenWidth, screenHeight);
    }

    /** Re-derive the world→screen scale (portrait, any height). */
    resize(screenWidth: number, screenHeight: number): void {
        // The world is always 100 units wide; its height follows the aspect ratio.
        this.scaleX = screenWidth / 100;
        this.scaleY = screenHeight / (100 * (screenHeight / screenWidth));
    }

    /** Feed a brick-destroyed event for a small burst (called by the scene). */
    burst(worldX: number, worldY: number, color: number): void {
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
                // Damaged bricks dim; multi-hp kinds shift hue after the first hit.
                .setFillStyle(this.brickColor(b.kind, b.hp, b.maxHp));
        }

        // --- balls ---
        for (let i = 0; i < this.ballPool.length; i++) {
            const sprite = this.ballPool[i];
            const b = i < snap.balls.length ? snap.balls[i] : undefined;
            if (!b) { sprite.setVisible(false); continue; }
            sprite.setVisible(true)
                .setPosition(b.x * this.scaleX, b.y * this.scaleY)
                .setDisplaySize(b.r * 2 * this.scaleX, b.r * 2 * this.scaleY)
                .setFillStyle(snap.fireball ? 0xff6b3d : 0xffffff);
        }

        // --- drops ---
        for (let i = 0; i < this.dropPool.length; i++) {
            const sprite = this.dropPool[i];
            const d = i < snap.drops.length ? snap.drops[i] : undefined;
            if (!d) { sprite.setVisible(false); continue; }
            sprite.setVisible(true)
                .setPosition(d.x * this.scaleX, d.y * this.scaleY)
                .setDisplaySize(5 * this.scaleX, 5 * this.scaleY)
                .setFillStyle(DROP_COLORS[d.kind]);
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

        // --- HUD ---
        this.scoreText.setText(String(snap.score));
        this.livesText.setText('♥ ' + Math.max(0, snap.lives));
        this.waveText.setText(`Wave ${snap.wave}`);

        this.comboText.setVisible(snap.combo > 1);
        if (snap.combo > 1) this.comboText.setText(`x${snap.combo}`);

        // --- banner + serve countdown ---
        if (snap.phase === 'banner') {
            this.bannerText.setVisible(true).setText(`Wave ${snap.wave + 1}`);
        } else {
            this.bannerText.setVisible(false);
        }
        if (snap.phase === 'serving' && snap.timerSeconds > 0.05) {
            this.serveText.setVisible(true).setText(String(Math.ceil(snap.timerSeconds)));
        } else {
            this.serveText.setVisible(false);
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

    private brickColor(kind: string, hp: number, maxHp: number): number {
        const base = BRICK_COLORS[kind] ?? 0xffffff;
        if (hp >= maxHp) return base;
        // Dim towards grey as hp drops; a sturdy brick visibly changes colour.
        return this.mix(base, 0x3a3a3c, (maxHp - hp) / maxHp);
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
