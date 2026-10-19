import Phaser from 'phaser';
import type { WorldSnapshot } from '../core/world.ts';
import { directionVector, ringCellAt } from '../core/ring.ts';
import { ensureCarTexture, REFERENCE_CELL, useNearest } from './carTextures.ts';
import { cellToScreen, computeBoardLayout } from './layout.ts';
import type { BoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { LIVES } from '../core/config.ts';
import { addText } from './text.ts';
import { THEME } from './theme.ts';
import { createButton } from './widgets.ts';

/** Blocked-car nudge: three quarter-cycles over a third of a second, then it settles. */
const SHAKE_MS = 320;
const SHAKE_PX = 3.5;

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

    /** Scene time each blocked car started shaking, so its offset is derived per frame. */
    private readonly shakes = new Map<number, number>();

    private readonly pulse: Phaser.GameObjects.Graphics;
    private readonly hud: Phaser.GameObjects.Container;

    private readonly scoreText: Phaser.GameObjects.Text;
    private readonly comboText: Phaser.GameObjects.Text;
    private readonly livesText: Phaser.GameObjects.Text;

    /** Score last drawn, so a change can be told apart from the initial 0. */
    private lastScore = 0;

    private disposed = false;

    constructor(
        private readonly scene: Phaser.Scene,
        cols: number,
        rows: number,
        onPause: () => void,
    ) {
        this.layout = computeBoardLayout(measureViewport(), cols, rows);
        this.pulse = scene.add.graphics().setDepth(1);
        this.buildBoard(cols, rows);

        this.hud = scene.add.container(0, 0);
        this.scoreText = addText(scene, 0, 0, '0', { fontSize: '30px', fontStyle: 'bold' });
        this.comboText = addText(scene, 0, 0, '', { fontSize: '18px', fontStyle: 'bold', color: THEME.text.accent });
        this.livesText = addText(scene, 0, 0, '', { fontSize: '26px', fontStyle: 'bold', color: THEME.text.danger });
        this.hud.add([this.scoreText, this.comboText, this.livesText]);

        this.hud.add(
            createButton(scene, {
                x: 0,
                y: 0,
                width: 64,
                height: 44,
                label: 'II',
                variant: 'neutral',
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

    /**
     * Three right-aligned rows fit the `HUD_HEIGHT` budget: fenders and level on top, the
     * pause pill under it. The pill used to start at `top + 56` while the fender line still
     * ran to `top + 42`, so the two overlapped and the pill covered the level readout.
     */
    /**
     * Lays the HUD out.
     *
     * Depth is set here rather than left to insertion order: the pulse is built before the
     * board and the board before the HUD, and at a shared depth of 0 that put the opaque
     * board texture ON TOP of the entry-window pulse — the one highlight the timing puzzle
     * depends on was being painted over every frame. Pinning the layers makes the stacking
     * survive a rebuild instead of depending on the order the constructor happens to add
     * things in.
     */
    private placeHud(): void {
        this.hud.setDepth(80);

        const top = Math.max(this.layout.viewport.safeTop, this.layout.viewport.height * 0.08);
        const inset = 16;

        this.scoreText.setPosition(inset, top + 8);
        this.comboText.setPosition(inset, top + 46);
        this.livesText.setPosition(this.layout.viewport.width - inset, top + 8);
        this.livesText.setOrigin(1, 0);

        const pause = this.hud.list[this.hud.list.length - 1] as Phaser.GameObjects.Container;
        pause.setPosition(this.layout.viewport.width - inset - 32, top + 66);
    }

    /**
     * Paints the ring road and the lot into one texture and blits it.
     *
     * The image is repositioned on EVERY call, not only when the texture is rebuilt: a
     * resize can move the board without changing its cell size (a wide window leaves the
     * cell height-bound), and an early return there would leave the road sitting where it
     * was while the cars moved to the new layout.
     */
    private buildBoard(cols: number, rows: number): void {
        const key = `board-${cols}x${rows}-${Math.round(this.layout.cell * 10)}`;
        if (this.boardKey !== key || !this.board) {
            if (this.board) {
                this.board.destroy();
                this.board = null;
            }
            if (this.scene.textures.exists(this.boardKey)) this.scene.textures.remove(this.boardKey);

            this.paintBoard(key, cols, rows);

            this.boardKey = key;
            this.board = this.scene.add
                .image(this.layout.x, this.layout.y, key)
                .setOrigin(0, 0)
                .setDepth(0);
        }

        this.board.setPosition(this.layout.x, this.layout.y);
    }

    /**
     * Draws the board texture in a flat, simplified style: one soft-cornered slab of
     * asphalt, warm dashes down each road edge, and a lighter parking apron ruled into
     * bays. Every shape is a plain fill plus a single edge stroke — no gradients — so the
     * cars stay the only thing with colour on screen.
     */
    private paintBoard(key: string, cols: number, rows: number): void {
        const cell = this.layout.cell;
        const width = Math.ceil((cols + 2) * cell);
        const height = Math.ceil((rows + 2) * cell);

        const g = this.scene.add.graphics();

        // The road: inset a hair so the page colour frames the slab instead of it
        // bleeding to a sharp corner against the background.
        const inset = 1;
        g.fillStyle(THEME.board.road, 1);
        g.fillRoundedRect(inset, inset, width - inset * 2, height - inset * 2, cell * 0.42);
        g.lineStyle(2, THEME.board.roadEdge, 1);
        g.strokeRoundedRect(inset, inset, width - inset * 2, height - inset * 2, cell * 0.42);

        // Lane markings: short rounded dashes down the middle of each road edge, with the
        // corners left clear so the ring reads as one continuous loop.
        const mark = Math.max(2, cell * 0.07);
        const dash = cell * 0.3;
        const gap = cell * 0.34;
        const corner = cell * 0.9;

        g.fillStyle(THEME.board.lane, 0.5);
        for (let d = corner; d < width - corner; d += dash + gap) {
            g.fillRoundedRect(d, cell * 0.5 - mark / 2, dash, mark, mark / 2);
            g.fillRoundedRect(d, height - cell * 0.5 - mark / 2, dash, mark, mark / 2);
        }
        for (let d = corner; d < height - corner; d += dash + gap) {
            g.fillRoundedRect(cell * 0.5 - mark / 2, d, mark, dash, mark / 2);
            g.fillRoundedRect(width - cell * 0.5 - mark / 2, d, mark, dash, mark / 2);
        }

        // The lot: a lighter apron inside the ring, ruled into bays by a light grid so the
        // parking spaces are countable without any label.
        const lotX = cell;
        const lotY = cell;
        const lotW = cols * cell;
        const lotH = rows * cell;

        g.fillStyle(THEME.board.lot, 1);
        g.fillRoundedRect(lotX, lotY, lotW, lotH, cell * 0.2);
        g.lineStyle(2, THEME.board.lotEdge, 1);
        g.strokeRoundedRect(lotX, lotY, lotW, lotH, cell * 0.2);

        g.lineStyle(1, THEME.board.lotLine, 0.4);
        for (let c = 1; c < cols; c++) {
            g.lineBetween(lotX + c * cell, lotY + 5, lotX + c * cell, lotY + lotH - 5);
        }
        for (let r = 1; r < rows; r++) {
            g.lineBetween(lotX + 5, lotY + r * cell, lotX + lotW - 5, lotY + r * cell);
        }

        g.generateTexture(key, width, height);
        g.destroy();

        // The board is baked in design units and then blown up by the camera's zoom, so it
        // needs the mode set on itself rather than inherited from the config: the bay rules
        // are a single design pixel wide and are the first thing bilinear smoothing smears.
        const board = this.scene.textures.get(key);
        useNearest(board);
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
        // Two pools, two membership sets. A car crosses from the lot to the ring the frame
        // after it joins: with one shared set it was "seen" in both pools, so its old lot
        // sprite was never pruned and sat frozen on the entry cell for a whole lap.
        const seenOnLot = new Set<number>();
        const seenOnRing = new Set<number>();

        for (const car of snapshot.parked) {
            seenOnLot.add(car.id);
            const sprite = this.carSprite(this.cars, car.id, car.color, car.length);
            const { dx, dy } = directionVector(car.dir);
            const centre = this.lotPoint(car.col - (dx * (car.length - 1)) / 2, car.row - (dy * (car.length - 1)) / 2);
            sprite.setPosition(centre.x + this.shakeOffset(car.id, car.blocked), centre.y);
            sprite.setRotation(angleOf(dx, dy));
            sprite.setScale(this.layout.cell / REFERENCE_CELL);
            sprite.setAlpha(1);
            sprite.setDepth(10 + car.row);
        }

        for (const car of snapshot.leaving) {
            seenOnLot.add(car.id);
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
            seenOnRing.add(car.id);
            const sprite = this.carSprite(this.ringCars, car.id, car.color, car.length);
            const centre = this.lotPoint(car.x - (car.dx * (car.length - 1)) / 2, car.y - (car.dy * (car.length - 1)) / 2);
            sprite.setPosition(centre.x, centre.y);
            sprite.setRotation(angleOf(car.dx, car.dy));
            sprite.setScale(this.layout.cell / REFERENCE_CELL);
            sprite.setAlpha(1);
            sprite.setDepth(40);
        }

        this.prune(this.cars, seenOnLot);
        this.prune(this.ringCars, seenOnRing);
    }

    /**
     * Horizontal nudge for a blocked car, computed from the clock at draw time.
     *
     * A tween on `x` could never render here: every sprite's position is rewritten from
     * the snapshot on the frame's UPDATE, which Phaser emits before the scene's `update`
     * hook that calls this method — so the tween's value was overwritten before it ever
     * reached the screen. Deriving the offset from elapsed time keeps the shake and the
     * layout in one place, with nothing to unwind when the block clears.
     */
    private shakeOffset(id: number, blocked: boolean): number {
        if (!blocked) {
            this.shakes.delete(id);
            return 0;
        }

        const start = this.shakes.get(id) ?? this.scene.time.now;
        this.shakes.set(id, start);

        const elapsed = this.scene.time.now - start;
        if (elapsed >= SHAKE_MS) return 0;
        return Math.sin((elapsed / SHAKE_MS) * Math.PI * 5) * SHAKE_PX;
    }

    private carSprite(
        pool: Map<number, Phaser.GameObjects.Sprite>,
        id: number,
        color: number,
        length: number,
    ): Phaser.GameObjects.Sprite {
        const key = ensureCarTexture(this.scene, color, length, id);
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
            this.shakes.delete(id);
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
        // The padlock sits over the lot, so it takes the danger colour rather than the old
        // gold: on a pale apron a gold lock has almost no contrast, while red reads as
        // "blocked" at a glance.
        ctx.strokeStyle = THEME.text.danger;
        ctx.fillStyle = THEME.text.danger;
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
        useNearest(texture);
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
                g.fillStyle(blocked ? THEME.pulse.blocked : THEME.pulse.open, blocked ? pulse : 0.12);
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
        if (snapshot.score !== this.lastScore) this.popScore(snapshot.score);

        if (snapshot.multiplier > 1) {
            this.comboText.setText(`x${snapshot.multiplier} COMBO`);
        } else if (snapshot.busActive) {
            this.comboText.setText('BUS ON THE RING');
        } else {
            this.comboText.setText('');
        }

        const fenders = '■'.repeat(Math.max(0, snapshot.lives)) + '□'.repeat(Math.max(0, LIVES - snapshot.lives));
        this.livesText.setText(`${fenders}   LV ${level}`);
    }

    /**
     * Bumps the score readout whenever it changes, so a landing car has a visible receipt.
     *
     * The tween re-targets the same text object each time rather than stacking a second
     * one: it is snapped back to 1.22 first, so a burst of points reads as one firm pulse
     * instead of an accumulating scale that runs away.
     */
    private popScore(score: number): void {
        this.lastScore = score;
        this.scene.tweens.killTweensOf(this.scoreText);
        this.scoreText.setScale(1.22);
        this.scene.tweens.add({
            targets: this.scoreText,
            scale: 1,
            duration: 200,
            ease: 'Back.easeOut',
        });
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
        this.shakes.clear();

        this.scene.tweens.killTweensOf(this.scoreText);
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
