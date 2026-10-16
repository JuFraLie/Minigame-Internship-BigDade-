import Phaser from 'phaser';
import type { WorldSnapshot } from '../core/world.ts';
import { directionVector, ringCellAt } from '../core/ring.ts';
import { ensureCarTexture, REFERENCE_CELL } from './carTextures.ts';
import { cellToScreen, computeBoardLayout } from './layout.ts';
import type { BoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { addText } from './text.ts';
import { createButton } from './widgets.ts';

const ROAD_COLOR = 0x2f3a46;
const ROAD_EDGE = 0x3f4d5c;
const LOT_COLOR = 0x59626d;
const LOT_EDGE = 0x78828e;
const LANE_LINE = 0xd9dee4;

/**
 * Everything the gameplay screen draws: the cached board, the cars, the entry-window
 * pulses and the HUD.
 *
 * The board — ring road, lot, parking slots — never changes while a round runs, so it is
 * painted once into a texture and blitted every frame. Only the cars and the pulse overlay
 * are redrawn, which is what keeps the frame cost flat as the ring fills up
 * (AGENTS.md §3.3).
 *
 * It reads a snapshot and nothing else: the renderer never reaches into the simulation.
 */
export class GameView {
    private layout: BoardLayout;
    private board: Phaser.GameObjects.Image | null = null;
    private boardKey = '';

    private readonly cars = new Map<number, Phaser.GameObjects.Sprite>();
    private readonly ringCars = new Map<number, Phaser.GameObjects.Sprite>();
    private readonly locks = new Map<number, Phaser.GameObjects.Image>();

    private readonly pulse: Phaser.GameObjects.Graphics;
    private readonly hud: Phaser.GameObjects.Container;

    private readonly scoreText: Phaser.GameObjects.Text;
    private readonly comboText: Phaser.GameObjects.Text;
    private readonly livesText: Phaser.GameObjects.Text;

    private disposed = false;

    constructor(
        private readonly scene: Phaser.Scene,
        cols: number,
        rows: number,
        onPause: () => void,
    ) {
        this.layout = computeBoardLayout(measureViewport(), cols, rows);
        this.pulse = scene.add.graphics();
        this.buildBoard(cols, rows);

        this.hud = scene.add.container(0, 0);
        this.scoreText = addText(scene, 0, 0, '0', { fontSize: '30px', fontStyle: 'bold' });
        this.comboText = addText(scene, 0, 0, '', { fontSize: '18px', fontStyle: 'bold', color: '#ffd166' });
        this.livesText = addText(scene, 0, 0, '', { fontSize: '26px', fontStyle: 'bold', color: '#ff6b6b' });
        this.hud.add([this.scoreText, this.comboText, this.livesText]);

        this.hud.add(
            createButton(scene, {
                x: 0,
                y: 0,
                width: 64,
                height: 44,
                label: 'II',
                fill: 0x3f4d5c,
                stroke: 0x78828e,
                fontSize: '20px',
                onTap: onPause,
            }),
        );

        this.placeHud();
    }

    /**
     * Rebuilds the layout and the cached board for the current screen size. A resize
     * mid-round must not lose the cars, so only the board texture and the sprite scales
     * are touched — the round itself is never reset (AGENTS.md §2).
     */
    relayout(): void {
        if (this.disposed) return;

        const { cols, rows } = this.layout;
        this.layout = computeBoardLayout(measureViewport(), cols, rows);
        this.buildBoard(cols, rows);
        this.placeHud();
    }

    private placeHud(): void {
        const top = Math.max(this.layout.viewport.safeTop, this.layout.viewport.height * 0.08);
        const inset = 16;

        this.scoreText.setPosition(inset, top + 10);
        this.comboText.setPosition(inset, top + 46);
        this.livesText.setPosition(this.layout.viewport.width - inset, top + 12);
        this.livesText.setOrigin(1, 0);

        const pause = this.hud.list[this.hud.list.length - 1] as Phaser.GameObjects.Container;
        pause.setPosition(this.layout.viewport.width - inset - 32, top + 56);
    }

    /** Paints the ring road and the lot into one texture and blits it. */
    private buildBoard(cols: number, rows: number): void {
        const key = `board-${cols}x${rows}-${Math.round(this.layout.cell * 10)}`;
        if (this.boardKey === key && this.board) return;

        if (this.board) {
            this.board.destroy();
            this.board = null;
        }
        if (this.scene.textures.exists(this.boardKey)) this.scene.textures.remove(this.boardKey);

        const cell = this.layout.cell;
        const width = Math.ceil((cols + 2) * cell);
        const height = Math.ceil((rows + 2) * cell);

        const graphics = this.scene.add.graphics();

        // Ring road: the whole board, lot included, starts as asphalt.
        graphics.fillStyle(ROAD_COLOR, 1);
        graphics.fillRect(0, 0, width, height);

        // Inner edge of the ring, so the road reads as a road and not as a background.
        graphics.lineStyle(2, ROAD_EDGE, 1);
        graphics.strokeRect(cell * 0.15, cell * 0.15, width - cell * 0.3, height - cell * 0.3);

        // The lot: a lighter apron inside the ring.
        const lotX = cell;
        const lotY = cell;
        graphics.fillStyle(LOT_COLOR, 1);
        graphics.fillRect(lotX, lotY, cols * cell, rows * cell);
        graphics.lineStyle(2, LOT_EDGE, 1);
        graphics.strokeRect(lotX, lotY, cols * cell, rows * cell);

        // Dashed lane line around the ring, on the road centre.
        graphics.lineStyle(2, LANE_LINE, 0.35);
        const cx = width / 2;
        const cy = height / 2;
        const dash = cell * 0.28;
        const gap = cell * 0.28;
        const half = Math.min(width, height) / 2 - cell * 0.5;

        for (let d = -half; d < half; d += dash + gap) {
            graphics.lineBetween(cx + d, cell * 0.5, cx + d + dash, cell * 0.5);
            graphics.lineBetween(cx + d, height - cell * 0.5, cx + d + dash, height - cell * 0.5);
            graphics.lineBetween(cell * 0.5, cy + d, cell * 0.5, cy + d + dash);
            graphics.lineBetween(width - cell * 0.5, cy + d, width - cell * 0.5, cy + d + dash);
        }

        graphics.generateTexture(key, width, height);
        graphics.destroy();

        this.boardKey = key;
        this.board = this.scene.add
            .image(this.layout.x, this.layout.y, key)
            .setOrigin(0, 0)
            .setDepth(0);
        this.boardKey = key;
    }

    /** Draws one frame from a snapshot. `level` comes from the session, not the world. */
    draw(snapshot: WorldSnapshot, level: number): void {
        if (this.disposed) return;

        this.drawPulse(snapshot);
        this.syncCars(snapshot);
        this.syncLocks(snapshot);
        this.drawHud(snapshot, level);
    }

    // ---- cars -------------------------------------------------------------------

    private syncCars(snapshot: WorldSnapshot): void {
        const seen = new Set<number>();

        for (const car of snapshot.parked) {
            seen.add(car.id);
            const sprite = this.carSprite(this.cars, car.id, car.color, car.length);
            const { dx, dy } = directionVector(car.dir);
            const centre = this.lotPoint(car.col - (dx * (car.length - 1)) / 2, car.row - (dy * (car.length - 1)) / 2);
            sprite.setPosition(centre.x, centre.y);
            sprite.setRotation(angleOf(dx, dy));
            sprite.setScale(this.layout.cell / REFERENCE_CELL);
            sprite.setAlpha(1);
            sprite.setDepth(10 + car.row);

            if (car.blocked && !sprite.getData('shaking')) {
                sprite.setData('shaking', true);
                this.scene.tweens.add({
                    targets: sprite,
                    x: centre.x + 4,
                    duration: 45,
                    yoyo: true,
                    repeat: 5,
                    onComplete: () => {
                        sprite.setData('shaking', false);
                        sprite.setX(centre.x);
                    },
                });
            }
        }

        for (const car of snapshot.leaving) {
            seen.add(car.id);
            const sprite = this.carSprite(this.cars, car.id, car.color, car.length);
            const { dx, dy } = directionVector(car.dir);
            const centre = this.lotPoint(car.x - (dx * (car.length - 1)) / 2, car.y - (dy * (car.length - 1)) / 2);
            sprite.setPosition(centre.x, centre.y);
            sprite.setRotation(angleOf(dx, dy));
            sprite.setScale(this.layout.cell / REFERENCE_CELL);
            sprite.setAlpha(1);
            sprite.setDepth(30);
        }

        for (const car of snapshot.ring) {
            seen.add(car.id);
            const sprite = this.carSprite(this.ringCars, car.id, car.color, car.length);
            const centre = this.lotPoint(car.x - (car.dx * (car.length - 1)) / 2, car.y - (car.dy * (car.length - 1)) / 2);
            sprite.setPosition(centre.x, centre.y);
            sprite.setRotation(angleOf(car.dx, car.dy));
            sprite.setScale(this.layout.cell / REFERENCE_CELL);
            sprite.setAlpha(1);
            sprite.setDepth(40);
        }

        this.prune(this.cars, seen);
        this.prune(this.ringCars, seen);
    }

    private carSprite(
        pool: Map<number, Phaser.GameObjects.Sprite>,
        id: number,
        color: number,
        length: number,
    ): Phaser.GameObjects.Sprite {
        const key = ensureCarTexture(this.scene, color, length);
        const existing = pool.get(id);
        if (existing && existing.texture.key === key) return existing;

        if (existing) existing.destroy();

        const sprite = this.scene.add.sprite(0, 0, key).setOrigin(0.5, 0.5);
        pool.set(id, sprite);
        return sprite;
    }

    private prune(pool: Map<number, Phaser.GameObjects.Sprite>, seen: Set<number>): void {
        for (const [id, sprite] of pool) {
            if (seen.has(id)) continue;
            sprite.destroy();
            pool.delete(id);
        }
    }

    /** A small padlock over a car that just tried to leave through a blocked path. */
    private syncLocks(snapshot: WorldSnapshot): void {
        const seen = new Set<number>();

        for (const car of snapshot.parked) {
            if (!car.blocked) continue;
            seen.add(car.id);

            const centre = this.lotPoint(car.col, car.row);
            let lock = this.locks.get(car.id);
            if (!lock) {
                lock = this.scene.add.image(centre.x, centre.y, 'lock').setOrigin(0.5, 0.5).setDepth(60);
                this.locks.set(car.id, lock);
                this.scene.tweens.add({
                    targets: lock,
                    scale: { from: 0.6, to: 1 },
                    duration: 120,
                    ease: 'Back.easeOut',
                });
            }
            lock.setPosition(centre.x, centre.y - this.layout.cell * 0.7);
        }

        for (const [id, lock] of this.locks) {
            if (seen.has(id)) continue;
            lock.destroy();
            this.locks.delete(id);
        }
    }

    /** Builds the padlock texture once; it is shared by every blocked car. */
    static ensureLockTexture(scene: Phaser.Scene): void {
        if (scene.textures.exists('lock')) return;

        const size = 24;
        const texture = scene.textures.createCanvas('lock', size, size);
        if (!texture) return;

        const ctx = texture.getContext();
        ctx.strokeStyle = '#ffd166';
        ctx.fillStyle = '#ffd166';
        ctx.lineWidth = 3;

        // Shackle.
        ctx.beginPath();
        ctx.arc(size / 2, 9, 5, Math.PI, 0);
        ctx.stroke();

        // Body.
        ctx.beginPath();
        const x = 5;
        const y = 9;
        const w = size - 10;
        const h = 12;
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + w - 3, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + 3);
        ctx.lineTo(x + w, y + h - 3);
        ctx.quadraticCurveTo(x + w, y + h, x + w - 3, y + h);
        ctx.lineTo(x + 3, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - 3);
        ctx.lineTo(x, y + 3);
        ctx.quadraticCurveTo(x, y, x + 3, y);
        ctx.fill();

        texture.refresh();
    }

    // ---- entry windows ----------------------------------------------------------

    /**
     * Softly pulsing red cells over every entry window that has a car in it.
     *
     * This is the read the whole timing puzzle hangs on: the cells a car needs are lit, so
     * "is there room yet?" is answered by looking rather than by counting.
     */
    private drawPulse(snapshot: WorldSnapshot): void {
        const g = this.pulse;
        g.clear();
        if (snapshot.phase !== 'playing') return;

        const pulse = 0.25 + 0.25 * Math.sin(snapshot.elapsed * 6);

        for (const entry of snapshot.entries) {
            const blocked = entry.occupied > 0;

            for (const cell of entry.cells) {
                const { x, y } = this.ringCellRect(cell, snapshot.cols, snapshot.rows);
                g.fillStyle(blocked ? 0xff4d4d : 0x8fb8ff, blocked ? pulse : 0.12);
                g.fillRect(x + 3, y + 3, this.layout.cell - 6, this.layout.cell - 6);
            }
        }
    }

    /** Screen rectangle of a ring cell given its clockwise index. */
    private ringCellRect(index: number, cols: number, rows: number): { x: number; y: number } {
        const cell = ringCellAt(cols, rows, index);
        return cellToScreen(this.layout, cell.x, cell.y);
    }

    // ---- HUD --------------------------------------------------------------------

    private drawHud(snapshot: WorldSnapshot, level: number): void {
        this.scoreText.setText(String(snapshot.score));

        if (snapshot.multiplier > 1) {
            this.comboText.setText(`x${snapshot.multiplier} COMBO`);
        } else if (snapshot.busActive) {
            this.comboText.setText('BUS ON THE RING');
        } else {
            this.comboText.setText('');
        }

        const fenders = '■'.repeat(Math.max(0, snapshot.lives)) + '□'.repeat(Math.max(0, 3 - snapshot.lives));
        this.livesText.setText(`${fenders}   LV ${level}`);
    }

    /** Continuous lot-space point to screen point. */
    private lotPoint(x: number, y: number): { x: number; y: number } {
        return {
            x: this.layout.x + (x + 1.5) * this.layout.cell,
            y: this.layout.y + (y + 1.5) * this.layout.cell,
        };
    }

    get boardLayout(): BoardLayout {
        return this.layout;
    }

    dispose(): void {
        this.disposed = true;

        for (const sprite of this.cars.values()) sprite.destroy();
        for (const sprite of this.ringCars.values()) sprite.destroy();
        for (const lock of this.locks.values()) lock.destroy();

        this.cars.clear();
        this.ringCars.clear();
        this.locks.clear();

        this.pulse.destroy();
        this.hud.destroy(true);
        if (this.board) this.board.destroy();
        if (this.scene.textures.exists(this.boardKey)) this.scene.textures.remove(this.boardKey);
    }
}

/** Screen rotation for a car pointing along `(dx, dy)`. Textures point right at 0. */
function angleOf(dx: number, dy: number): number {
    return Math.atan2(dy, dx);
}
