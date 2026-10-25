/**
 * Phaser Canvas renderer. Implements RendererPort.
 *
 * Draws a WorldSnapshot (world units, 100 wide) onto the screen using pooled
 * shapes plus the gradient textures from ./theme.ts — no bundled image assets,
 * no allocation inside the frame loop. Particle bursts are small and capped to
 * protect the frame rate on the reference device class.
 */

import type Phaser from 'phaser';
import type { RendererPort } from '../../domain/ports.ts';
import type { PowerUpKind, WorldSnapshot } from '../../domain/types.ts';
import { BRICK_GAP, BRICK_H, BRICK_TOP_FRAC } from '../../domain/config.ts';
import { hudBand, THEME } from './theme.ts';
import { hudTop, renderScale, type Viewport } from './viewport.ts';

const MAX_BRICK_SPRITES = 96; // = MAX_BRICKS: the endless field's biggest wave
const MAX_BALL_SPRITES = 6;
const MAX_DROP_SPRITES = 10;
const MAX_PARTICLES = 24;

const DROP_COLORS: Record<PowerUpKind, number> = {
    multi: 0xffd23f,   // yellow — +1 ball (the one you want)
    wide: 0x4cd964,    // green — wide paddle
    slow: 0x5ac8fa,    // blue — slow ball
    fire: 0xff6b3d,    // orange — fireball
    shield: 0xaf52de,  // purple — shield
    shrink: 0x8e8e93,  // grey — the bad one
};

/**
 * Brick colours. The two armoured kinds keep fixed, unmistakable colours;
 * basic bricks sweep a cool spectrum row by row (sky → blue → violet → rose),
 * so a dense wave still reads as colour while green and orange stay free for
 * "takes two hits" and "takes three".
 */
const BASIC_ROW_COLORS = [
    0x5ac8fa, 0x36a2eb, 0x4c6fff, 0x5e5ce6, 0x8b5cf6, 0xaf52de, 0xff375f, 0xff6482,
];

const BRICK_COLORS: Record<string, number> = {
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
    private hudFontSize = 12;

    private readonly brickPool: Phaser.GameObjects.Rectangle[] = [];
    private readonly ballPool: Phaser.GameObjects.Arc[] = [];
    private readonly ballGlowPool: Phaser.GameObjects.Arc[] = [];
    private readonly dropPool: Phaser.GameObjects.Arc[] = [];
    private readonly particles: Particle[] = [];

    private paddle!: Phaser.GameObjects.Rectangle;
    private shieldLine!: Phaser.GameObjects.Rectangle;
    private scoreText!: Phaser.GameObjects.Text;
    private ballText!: Phaser.GameObjects.Text;
    private waveText!: Phaser.GameObjects.Text;
    private bannerText!: Phaser.GameObjects.Text;
    private serveText!: Phaser.GameObjects.Text;
    private comboText!: Phaser.GameObjects.Text;

    /** World height in world units — where the brick rows actually start. */
    private worldHeight = 100;
    /** Tinted strip behind the HUD, rebuilt whenever the viewport changes. */
    private hudBandImage: Phaser.GameObjects.Image | null = null;

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
        const screenWidth = viewport.width;

        this.paddle = s.add.rectangle(0, 0, 10, 10, THEME.paddle).setOrigin(0.5);
        this.shieldLine = s.add.rectangle(0, 0, 10, 3, 0xaf52de).setOrigin(0.5).setVisible(false);

        for (let i = 0; i < MAX_BRICK_SPRITES; i++) {
            this.brickPool.push(s.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0.5).setVisible(false));
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

        const fontSize = Math.round(screenWidth * 0.045);
        const style: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: 'system-ui, sans-serif',
            color: '#ffffff',
            fontSize: `${fontSize}px`,
        };
        this.hudFontSize = fontSize;
        // Three colours across the HUD row: gold score, sky wave, green balls.
        this.scoreText = s.add.text(screenWidth * 0.04, 0, '0', {
            ...style,
            color: '#ffd23f',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.waveText = s.add.text(screenWidth * 0.5, 0, 'Wave 1', {
            ...style,
            color: '#64d2ff',
        }).setOrigin(0.5);
        this.ballText = s.add.text(screenWidth * 0.96, 0, '● 1', {
            ...style,
            color: '#32d74b',
            fontStyle: 'bold',
        }).setOrigin(1, 0.5);

        const bigStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            ...style,
            fontSize: `${Math.round(screenWidth * 0.09)}px`,
            fontStyle: 'bold',
        };
        this.bannerText = s.add.text(screenWidth * 0.5, viewport.height * 0.4, '', {
            ...bigStyle,
            color: '#ffd23f',
            stroke: '#af52de',
            strokeThickness: Math.max(3, Math.round(screenWidth * 0.014)),
        }).setOrigin(0.5).setVisible(false);

        this.serveText = s.add.text(screenWidth * 0.5, viewport.height * 0.6, '', {
            ...bigStyle,
            color: '#64d2ff',
            stroke: '#141a34',
            strokeThickness: Math.max(3, Math.round(screenWidth * 0.01)),
        }).setOrigin(0.5).setVisible(false);

        this.comboText = s.add.text(screenWidth * 0.5, viewport.height * 0.16, '', {
            ...style,
            fontSize: `${Math.round(screenWidth * 0.05)}px`,
            fontStyle: 'bold',
            color: '#ff375f',
            stroke: '#ffffff',
            strokeThickness: Math.max(2, Math.round(screenWidth * 0.007)),
        }).setOrigin(0.5).setVisible(false);

        this.layout(viewport);
    }

    /**
     * Re-derive the world→screen scale and reposition the HUD for the given
     * viewport (portrait, any height). The HUD sits below the device's real
     * cutout/status-bar inset — never less than the design doc's 8%.
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

        const bandHeight = hudTop(viewport, this.hudFontSize);
        this.hudBandImage?.destroy();
        this.hudBandImage = hudBand(this.scene, width, bandHeight);

        const hudY = bandHeight * 0.5;
        this.scoreText?.setPosition(width * 0.04, hudY);
        this.waveText?.setPosition(width * 0.5, hudY);
        this.ballText?.setPosition(width * 0.96, hudY);
        this.comboText?.setPosition(width * 0.5, bandHeight + width * 0.06);
        this.bannerText?.setPosition(width * 0.5, height * 0.4);
        this.serveText?.setPosition(width * 0.5, height * 0.6);
    }

    /**
     * Brick destroyed: a small burst in the brick's own colour — the row sweep
     * comes from where the brick sits, exactly as it is drawn on screen.
     */
    burstBrick(worldX: number, worldY: number, kind: string): void {
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
        this.ballText.setText('● ' + Math.max(0, snap.ballCount));
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

    /** Undamaged colour for a brick: the kind, swept by row for basics. */
    private brickBase(kind: string, y: number): number {
        if (kind === 'basic') {
            const row = Math.round(
                (y - this.worldHeight * BRICK_TOP_FRAC - BRICK_H / 2) / (BRICK_H + BRICK_GAP),
            );
            const index = ((row % BASIC_ROW_COLORS.length) + BASIC_ROW_COLORS.length) % BASIC_ROW_COLORS.length;
            return BASIC_ROW_COLORS[index];
        }
        return BRICK_COLORS[kind] ?? 0xffffff;
    }

    private brickColor(kind: string, y: number, hp: number, maxHp: number): number {
        const base = this.brickBase(kind, y);
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
