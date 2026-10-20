import Phaser from 'phaser';
import type { WorldSnapshot, RingCarView } from '../core/world.ts';
import { directionVector, ringCellAt, ringPointContinuous } from '../core/ring.ts';
import { ensureCarTexture, REFERENCE_CELL, useNearest } from './carTextures.ts';
import { cellToScreen, computeBoardLayout } from './layout.ts';
import type { BoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { LIVES } from '../core/config.ts';
import { addText } from './text.ts';
import { THEME } from './theme.ts';
import { mixColor } from './color.ts';
import { createArcadeButton, paintSticker } from './widgets.ts';

/** Blocked-car nudge: three quarter-cycles over a third of a second, then it settles. */
const SHAKE_MS = 320;
const SHAKE_PX = 3.5;

/**
 * Ink outline drawn around the board slab.
 *
 * The board is baked into a texture that is this much larger than the lot-plus-ring
 * rectangle, and the image is placed this much up and to the left of the layout origin,
 * so the outline hangs outside the play area while the road surface stays exactly where
 * `cellToScreen` says it is — the cars are placed against the layout, never the texture.
 */
const BOARD_EDGE = 4;

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
    /** Dusk sky behind everything, baked once per screen size like the board. */
    private sky: Phaser.GameObjects.Image | null = null;
    private skyKey = '';

    private readonly cars = new Map<number, Phaser.GameObjects.Sprite>();
    private readonly ringCars = new Map<number, Phaser.GameObjects.Sprite>();
    private readonly locks = new Map<number, Phaser.GameObjects.Image>();

    /** Scene time each blocked car started shaking, so its offset is derived per frame. */
    private readonly shakes = new Map<number, number>();

    private readonly pulse: Phaser.GameObjects.Graphics;
    private readonly hud: Phaser.GameObjects.Container;
    /** Sticker cards behind the HUD texts — one graphics, cleared and repainted as they change. */
    private readonly chips: Phaser.GameObjects.Graphics;

    private readonly scoreCaption: Phaser.GameObjects.Text;
    private readonly scoreText: Phaser.GameObjects.Text;
    private readonly comboText: Phaser.GameObjects.Text;
    private readonly fendersText: Phaser.GameObjects.Text;
    private readonly levelText: Phaser.GameObjects.Text;
    private readonly pauseButton: Phaser.GameObjects.Container;

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
        this.buildSky();
        this.pulse = scene.add.graphics().setDepth(1);
        this.buildBoard(cols, rows);

        this.hud = scene.add.container(0, 0);

        // Sticker cards sit behind the texts in the container, so they always render under.
        this.chips = scene.add.graphics();
        this.hud.add(this.chips);

        this.scoreCaption = addText(scene, 0, 0, 'SCORE', {
            fontSize: '10px',
            fontStyle: 'bold',
            color: THEME.menu.cardInkCss,
            letterSpacing: 1,
        });
        this.scoreText = addText(scene, 0, 0, '0', {
            fontSize: '26px',
            fontStyle: 'bold',
            color: THEME.text.accent,
        });
        this.comboText = addText(scene, 0, 0, '', {
            fontSize: '12px',
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            stroke: THEME.menu.inkCss,
            strokeThickness: 3,
            letterSpacing: 1,
        });
        this.fendersText = addText(scene, 0, 0, '', {
            fontSize: '15px',
            fontStyle: 'bold',
            color: THEME.text.onFill,
            stroke: THEME.menu.inkCss,
            strokeThickness: 3,
        });
        this.levelText = addText(scene, 0, 0, '', {
            fontSize: '14px',
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            stroke: THEME.menu.inkCss,
            strokeThickness: 3,
            letterSpacing: 1,
        });
        this.hud.add([
            this.scoreCaption,
            this.scoreText,
            this.comboText,
            this.fendersText,
            this.levelText,
        ]);

        this.pauseButton = createArcadeButton(scene, {
            x: 0,
            y: 0,
            width: 52,
            height: 40,
            label: 'II',
            topColour: THEME.menu.card,
            bodyColour: THEME.menu.card,
            labelColour: THEME.menu.cardInkCss,
            strokeColour: '',
            fontSize: 17,
            onTap: onPause,
        });
        this.hud.add(this.pauseButton);

        this.layoutHud();
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
        this.buildSky();
        this.buildBoard(cols, rows);
        this.layoutHud();
    }

    /**
     * Bakes the dusk sky once per screen size and blits it behind everything.
     *
     * The Play Screen paints this gradient with animated bands; the round does not need
     * the motion, so it is baked into a texture instead and costs nothing per frame. It is
     * what puts the round on the same screen as the two panels either side of it — without
     * it the road would float on the page colour instead of sitting in the same sky.
     */
    private buildSky(): void {
        const { width, height } = this.layout.viewport;
        const key = `sky-${Math.round(width)}x${Math.round(height)}`;
        if (this.skyKey !== key || !this.sky) {
            if (this.sky) {
                this.sky.destroy();
                this.sky = null;
            }
            if (this.scene.textures.exists(this.skyKey)) this.scene.textures.remove(this.skyKey);

            this.paintSky(key, width, height);
            this.skyKey = key;
            this.sky = this.scene.add
                .image(0, 0, key)
                .setOrigin(0, 0)
                .setDepth(-10);
        }

        this.sky.setPosition(0, 0);
    }

    /** Stepped bands down the screen: `fillGradientStyle` is WebGL only, this is Canvas. */
    private paintSky(key: string, width: number, height: number): void {
        const [top, middle, bottom] = THEME.menu.sky;
        const g = this.scene.add.graphics();
        const bands = 32;
        const bandHeight = height / bands;
        for (let i = 0; i < bands; i += 1) {
            const t = i / (bands - 1);
            const colour =
                t < 0.5 ? mixColor(top, middle, t * 2) : mixColor(middle, bottom, (t - 0.5) * 2);
            // One px past the band: adjoining rects otherwise leave hairline seams.
            g.fillStyle(colour, 1);
            g.fillRect(0, i * bandHeight, width, bandHeight + 1);
        }
        g.generateTexture(key, width, height);
        g.destroy();
    }

    /**
     * Lays the HUD out and paints the chip cards behind the readouts.
     *
     * Depth is set here rather than left to insertion order: the pulse is built before the
     * board and the board before the HUD, and at a shared depth of 0 that put the opaque
     * board texture ON TOP of the entry-window pulse — the one highlight the timing puzzle
     * depends on was being painted over every frame. Pinning the layers makes the stacking
     * survive a rebuild instead of depending on the order the constructor happens to add
     * things in.
     *
     * Called once per layout AND once per value change from `drawHud`: the chip widths
     * hug their texts, so a score that grows by a digit repaints its own card.
     */
    private layoutHud(): void {
        this.hud.setDepth(80);

        const viewport = this.layout.viewport;
        const top = Math.max(viewport.safeTop, viewport.height * 0.08);
        const inset = 14;
        const g = this.chips;
        g.clear();

        // Score sticker, top-left: small caption over the big number, on the same cream
        // card the how-to and the result panel use.
        const scorePadX = 14;
        const scoreW = Math.max(92, Math.max(this.scoreCaption.width, this.scoreText.width) + scorePadX * 2);
        const scoreH = 56;
        paintSticker(g, inset, top, scoreW, scoreH, 16, THEME.menu.card, { shadowX: 5, shadowY: 7 });
        this.scoreCaption.setPosition(inset + scorePadX, top + 7);
        this.scoreText.setPosition(inset + scorePadX, top + 20);

        // Level plate, top-right: the same tilted-free amber slab as the title's second
        // line and the Result Panel's level chip.
        const levelPadX = 13;
        const levelH = 34;
        const levelW = this.levelText.width + levelPadX * 2;
        const levelX = viewport.width - inset - levelW;
        paintSticker(g, levelX, top, levelW, levelH, 12, THEME.menu.plate, {
            shadowX: 5,
            shadowY: 6,
        });
        this.levelText.setPosition(levelX + levelPadX, top + (levelH - this.levelText.height) / 2);

        // Fenders chip, immediately left of the level plate, in the danger orange the
        // Result Panel's RETRY wears — a lost fender is the same red everywhere.
        const fenderPadX = 12;
        const fenderW = Math.max(62, this.fendersText.width + fenderPadX * 2);
        const fenderX = levelX - 8 - fenderW;
        paintSticker(g, fenderX, top, fenderW, levelH, 12, THEME.button.danger.fill, {
            shadowX: 5,
            shadowY: 6,
        });
        this.fendersText.setPosition(fenderX + fenderPadX, top + (levelH - this.fendersText.height) / 2);

        // Combo chip under the score — accent slab, only while it says something. Both it
        // and the pause slab below are kept inside the HUD band the board reserves
        // (`HUD_HEIGHT`, 92px), so on a wide window where the board sits flush under the
        // HUD neither can land on the road.
        const scoreBottom = top + scoreH + 6;
        if (this.comboText.text) {
            const comboW = this.comboText.width + 24;
            const comboH = 26;
            paintSticker(g, inset, scoreBottom, comboW, comboH, 12, THEME.menu.plate, {
                shadowX: 4,
                shadowY: 5,
                lineWidth: 3,
            });
            this.comboText
                .setPosition(inset + 12, scoreBottom + (comboH - this.comboText.height) / 2)
                .setVisible(true);
        } else {
            this.comboText.setVisible(false);
        }

        // Pause sticker under the fender chip, kept clear of the board below it.
        this.pauseButton.setPosition(viewport.width - inset - 26, top + levelH + 28);
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

        // Pulled back by half the outline: the road surface is drawn that far inside the
        // texture, so this puts it back on the layout origin the cars are measured from.
        this.board.setPosition(this.layout.x - BOARD_EDGE / 2, this.layout.y - BOARD_EDGE / 2);
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
        // Everything is drawn this far in, so the ink outline hangs outside the slab and
        // the road surface still starts exactly where the layout origin says it does.
        const o = BOARD_EDGE / 2;

        const g = this.scene.add.graphics();

        // The slab wears the same heavy ink outline and extruded shadow as every other
        // chunk on this screen, so it reads as a sticker laid on the dusk sky rather than
        // as a hole cut in it. Without the outline the black road simply vanished into
        // the dark end of the gradient.
        g.fillStyle(THEME.menu.ink, 1);
        g.fillRoundedRect(0, 0, width + BOARD_EDGE, height + BOARD_EDGE, cell * 0.42 + o);
        g.fillStyle(THEME.board.road, 1);
        g.fillRoundedRect(o, o, width, height, cell * 0.42);
        g.lineStyle(BOARD_EDGE, THEME.menu.ink, 1);
        g.strokeRoundedRect(o, o, width, height, cell * 0.42);

        // Lane markings: short rounded dashes down the middle of each road edge, with the
        // corners left clear so the ring reads as one continuous loop.
        const mark = Math.max(2, cell * 0.07);
        const dash = cell * 0.3;
        const gap = cell * 0.34;
        const corner = cell * 0.9;

        g.fillStyle(THEME.board.lane, 0.5);
        for (let d = corner; d < width - corner; d += dash + gap) {
            g.fillRoundedRect(o + d, o + cell * 0.5 - mark / 2, dash, mark, mark / 2);
            g.fillRoundedRect(o + d, o + height - cell * 0.5 - mark / 2, dash, mark, mark / 2);
        }
        for (let d = corner; d < height - corner; d += dash + gap) {
            g.fillRoundedRect(o + cell * 0.5 - mark / 2, o + d, mark, dash, mark / 2);
            g.fillRoundedRect(o + width - cell * 0.5 - mark / 2, o + d, mark, dash, mark / 2);
        }

        // The lot: a lighter apron inside the ring, ruled into bays by a light grid so the
        // parking spaces are countable without any label.
        const lotX = o + cell;
        const lotY = o + cell;
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

        // Sized to the outline as well as the slab, or the ink edge is clipped off.
        g.generateTexture(key, width + BOARD_EDGE, height + BOARD_EDGE);
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
            const { centre, angle } = this.ringPose(snapshot.cols, snapshot.rows, car);
            sprite.setPosition(centre.x, centre.y);
            sprite.setRotation(angle);
            sprite.setScale(this.layout.cell / REFERENCE_CELL);
            sprite.setAlpha(1);
            sprite.setDepth(40);
        }

        this.prune(this.cars, seenOnLot);
        this.prune(this.ringCars, seenOnRing);
    }

    /**
     * Where a ring car is drawn: the chord from its tail cell to its nose cell, clamped
     * so the rotated body always stays on the slab.
     *
     * The old pose rigidly hung the whole body off the nose using the segment direction,
     * and the frame the nose crossed a corner cell that direction snapped 90° — swinging
     * the body sideways across the road and, for a moment, clean off the slab.
     *
     * Both endpoints of the chord come from `ringPointContinuous`, which turns corners
     * through the corner cell's centre instead of walking off the edge, so the chord
     * spans exactly the cells the simulation says the car occupies: straights are
     * straight, and at a corner the car tilts through the turn the way a real one does.
     *
     * A tilted body's bounding box grows past its endpoints (widest at 45°), so the
     * centre is then projected back inside the board rectangle — the clamp only ever
     * binds at corners, where it pulls the car a fifth of a cell toward the inside of
     * the turn rather than let a corner of the sprite hang over the tarmac's edge.
     */
    private ringPose(
        cols: number,
        rows: number,
        car: RingCarView,
    ): { centre: { x: number; y: number }; angle: number } {
        const nose = ringPointContinuous(cols, rows, car.pos);
        const tail = ringPointContinuous(cols, rows, car.pos - (car.length - 1));

        // Length-1 vehicles have no chord to measure — fall back to the local direction.
        const dx = nose.x - tail.x;
        const dy = nose.y - tail.y;
        const angle = dx === 0 && dy === 0 ? Math.atan2(nose.dy, nose.dx) : Math.atan2(dy, dx);

        const centreX = (nose.x + tail.x) / 2;
        const centreY = (nose.y + tail.y) / 2;
        const centre = this.lotPoint(centreX, centreY);

        // Screen-space half-extents of the tilted body (0.9 fill along, 0.88 across).
        const halfLength = (car.length * 0.9) / 2;
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        const halfW = (halfLength * cos + 0.44 * sin) * this.layout.cell;
        const halfH = (halfLength * sin + 0.44 * cos) * this.layout.cell;

        const left = this.layout.x + halfW;
        const right = this.layout.x + this.layout.width - halfW;
        const top = this.layout.y + halfH;
        const bottom = this.layout.y + this.layout.height - halfH;

        if (left <= right) centre.x = Math.min(right, Math.max(left, centre.x));
        if (top <= bottom) centre.y = Math.min(bottom, Math.max(top, centre.y));

        return { centre, angle };
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
        // The padlock sits on the black parking apron, so it takes the bright gold accent —
        // the one colour in the palette chosen to sing against asphalt.
        ctx.strokeStyle = THEME.lock;
        ctx.fillStyle = THEME.lock;
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
        const score = String(snapshot.score);
        const fenders =
            '■'.repeat(Math.max(0, snapshot.lives)) + '□'.repeat(Math.max(0, LIVES - snapshot.lives));
        const levelLabel = `LV ${level}`;

        let combo = '';
        if (snapshot.multiplier > 1) combo = `x${snapshot.multiplier} COMBO`;
        else if (snapshot.busActive) combo = 'BUS ON THE RING';

        // Chips hug their texts, so they are repainted only when a value actually moved —
        // score digits, a spent fender or a level-up are the rare frames that pay for it.
        if (
            score !== this.scoreText.text ||
            combo !== this.comboText.text ||
            fenders !== this.fendersText.text ||
            levelLabel !== this.levelText.text
        ) {
            this.scoreText.setText(score);
            this.comboText.setText(combo);
            this.fendersText.setText(fenders);
            this.levelText.setText(levelLabel);
            this.layoutHud();
        }

        if (snapshot.score !== this.lastScore) this.popScore(snapshot.score);
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
        if (this.sky) this.sky.destroy();
        this.sky = null;
        if (this.scene.textures.exists(this.skyKey)) this.scene.textures.remove(this.skyKey);
    }
}

/** Screen rotation for a car pointing along `(dx, dy)`. Textures point right at 0. */
function angleOf(dx: number, dy: number): number {
    return Math.atan2(dy, dx);
}
