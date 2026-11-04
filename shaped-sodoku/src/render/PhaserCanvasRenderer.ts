import Phaser from 'phaser';

import type { BoardSize } from '../domain/Board.ts';
import { gridFor, type Grid } from '../domain/Board.ts';
import type { LineRef } from '../domain/Rules.ts';
import type { RoundSnapshot } from '../domain/ports.ts';
import type { ShapeId } from '../domain/shapes.ts';
import { formatScore } from '../domain/Scoring.ts';
import type { GameLayout } from './GameLayout.ts';
import { CONFETTI_COLOURS, confettiTextureKey, ensureTextures, HEART_KEY, HEART_SPENT_KEY, SHAPE_TEXTURE_SIZE, shapeTextureKey } from './ShapeTextures.ts';
import { FONT_STACK, PALETTE } from './palette.ts';
import type { RenderPort } from './RenderPort.ts';

/** Layers, so a highlight wash never paints over a sprite that belongs above it. */
const DEPTH = {
    background: 0,
    board: 1,
    highlight: 2,
    cells: 3,
    tray: 4,
    trayShapes: 5,
    trayBadges: 6,
    hud: 7,
    danger: 8,
    confetti: 9,
} as const;

const CONFETTI_COUNT = 48;
const CONFETTI_PER_LINE = 14;
const BLINK_AT_MS = 360;
const BLINK_OFF_MS = 500;
const PLACEMENT_BUSY_MS = 620;

/**
 * The only class in the project that draws.
 *
 * It implements `RenderPort`, and nothing else knows it exists: the play scene holds the
 * interface and `src/app/` decides this is the implementation. Swap it for a headless fake
 * and every round still plays — which is precisely what the logic benchmarks rely on.
 *
 * Rendering is `Phaser.CANVAS` only; WebGL is never enabled anywhere in this project.
 */
export class PhaserCanvasRenderer implements RenderPort {
    readonly #scene: Phaser.Scene;
    /**
     * Backing-store density, injected by the composition root.
     *
     * Every text object needs it in its style *at construction time*: Phaser stamps
     * `frame.source.resolution` exactly once while building the Text, and the canvas
     * renderer divides the drawn size by that stamp. Without it glyphs are rasterised at
     * design size and then blown up by the camera zoom — correctly sized, but visibly
     * soft on any phone with a density above 1×.
     */
    readonly #renderScale: () => number;

    #layout: GameLayout | null = null;
    #grid: BoardSize | null = null;
    #snapshot: RoundSnapshot | null = null;
    #selected: number | null = null;

    /**
     * Cells with an animation in flight, keyed to a token so a later animation on the same
     * cell can't be ended early by an older timer. `sync` and `relayout` step around these,
     * because otherwise a redraw would stomp the very tween that is running.
     */
    readonly #busy = new Map<number, unknown>();

    #background: Phaser.GameObjects.Image | null = null;
    #boardGfx: Phaser.GameObjects.Graphics | null = null;
    #highlightGfx: Phaser.GameObjects.Graphics | null = null;
    #trayGfx: Phaser.GameObjects.Graphics | null = null;
    #dangerGfx: Phaser.GameObjects.Graphics | null = null;

    #cells: Phaser.GameObjects.Image[] = [];
    #trayShapes: Phaser.GameObjects.Image[] = [];
    #trayBadges: Phaser.GameObjects.Text[] = [];
    #hearts: Phaser.GameObjects.Image[] = [];
    #confetti: Phaser.GameObjects.Image[] = [];
    #confettiCursor = 0;
    #scoreText: Phaser.GameObjects.Text | null = null;
    #levelText: Phaser.GameObjects.Text | null = null;
    #timeText: Phaser.GameObjects.Text | null = null;

    constructor(scene: Phaser.Scene, renderScale: () => number) {
        this.#scene = scene;
        this.#renderScale = renderScale;
    }

    create(layout: GameLayout, grid: BoardSize): void {
        const scene = this.#scene;
        ensureTextures(scene);

        this.#grid = grid;
        this.#layout = layout;

        this.#background = scene.add.image(0, 0, 'background-wash').setOrigin(0).setDepth(DEPTH.background);
        this.#boardGfx = scene.add.graphics().setDepth(DEPTH.board);
        this.#highlightGfx = scene.add.graphics().setDepth(DEPTH.highlight);
        this.#trayGfx = scene.add.graphics().setDepth(DEPTH.tray);
        this.#dangerGfx = scene.add.graphics().setDepth(DEPTH.danger).setAlpha(0);

        const shapeCount = Math.min(grid.size, 6);

        this.#cells = Array.from({ length: grid.size * grid.size }, () =>
            scene.add.image(0, 0, 'shape-0-normal').setDepth(DEPTH.cells).setVisible(false),
        );
        this.#trayShapes = Array.from({ length: shapeCount }, () =>
            scene.add.image(0, 0, shapeTextureKey(0, 'normal')).setDepth(DEPTH.trayShapes),
        );
        this.#trayBadges = Array.from({ length: shapeCount }, () =>
            scene.add
                .text(0, 0, '0', {
                    fontFamily: FONT_STACK,
                    fontSize: '14px',
                    fontStyle: 'bold',
                    color: '#1c2148',
                    backgroundColor: '#fdf4e6',
                    padding: { x: 5, y: 1 },
                    resolution: this.#renderScale(),
                })
                .setOrigin(0.5)
                .setDepth(DEPTH.trayBadges),
        );

        this.#scoreText = scene.add
            .text(0, 0, '0', {
                fontFamily: FONT_STACK,
                fontSize: '28px',
                fontStyle: 'bold',
                color: '#fdf4e6',
                resolution: this.#renderScale(),
            })
            .setOrigin(0.5)
            .setDepth(DEPTH.hud);

        this.#levelText = scene.add
            .text(0, 0, 'Level 1', {
                fontFamily: FONT_STACK,
                fontSize: '16px',
                color: '#b9b3d8',
                resolution: this.#renderScale(),
            })
            .setOrigin(0, 0.5)
            .setDepth(DEPTH.hud);

        this.#timeText = scene.add
            .text(0, 0, '', {
                fontFamily: FONT_STACK,
                fontSize: '15px',
                color: '#b9b3d8',
                resolution: this.#renderScale(),
            })
            .setOrigin(1, 0.5)
            .setDepth(DEPTH.hud);

        this.#hearts = Array.from({ length: 3 }, () =>
            scene.add.image(0, 0, HEART_KEY).setDepth(DEPTH.hud).setScale(0.3),
        );
        this.#confetti = Array.from({ length: CONFETTI_COUNT }, () =>
            scene.add.image(0, 0, confettiTextureKey(0)).setDepth(DEPTH.confetti).setVisible(false),
        );

        this.relayout(layout);
    }

    relayout(layout: GameLayout): void {
        this.#layout = layout;
        if (!this.#grid) return;

        const { viewport, board, hud, tray } = layout;
        const gridSize = this.#grid.size;
        const grid = gridFor(this.#grid);
        const cellSpriteScale = (board.cell - board.inset * 2) / SHAPE_TEXTURE_SIZE;

        this.#background?.setDisplaySize(viewport.width, viewport.height);
        this.#drawBoard(layout, gridSize, grid);
        this.#drawTray(layout);

        // Level labels the left, score takes centre stage, clock and hearts hold the right.
        const hudMidY = hud.y + hud.height / 2;
        const scoreFont = Math.round(hud.height * 0.52);
        this.#scoreText?.setPosition(viewport.width / 2, hudMidY).setFontSize(scoreFont);
        this.#levelText?.setPosition(viewport.width * 0.06, hudMidY).setFontSize(Math.round(hud.height * 0.3));
        this.#levelText?.setVisible(true);

        const heartGap = Math.max(16, hud.height * 0.42);
        const heartsWidth = heartGap * (this.#hearts.length - 1);
        const heartsRight = viewport.width * 0.94;
        this.#hearts.forEach((heart, index) => {
            heart.setPosition(heartsRight - heartsWidth + index * heartGap, hudMidY);
        });

        this.#timeText?.setFontSize(Math.round(hud.height * 0.27));
        this.#timeText?.setPosition(heartsRight - heartsWidth - heartGap * 0.8, hudMidY);

        const badgeFont = Math.max(11, Math.round(hud.height * 0.27));
        this.#cells.forEach((cell, index) => {
            cell.setPosition(
                board.x + (index % gridSize) * board.cell + board.cell / 2,
                board.y + Math.floor(index / gridSize) * board.cell + board.cell / 2,
            );
            // Never write scale under a running tween — the animation owns it until it ends.
            if (!this.#busy.has(index)) cell.setScale(cellSpriteScale);
        });

        tray.slots.forEach((slot, index) => {
            this.#trayShapes[index]?.setPosition(slot.cx, slot.cy).setScale((slot.radius * 2) / SHAPE_TEXTURE_SIZE);
            this.#trayBadges[index]
                ?.setPosition(slot.cx + tray.slotWidth * 0.3, tray.y + tray.height * 0.22)
                .setFontSize(badgeFont);
        });

        this.#redrawHighlight();
        if (this.#snapshot) this.#applyState(this.#snapshot);
    }

    sync(snapshot: RoundSnapshot): void {
        this.#snapshot = snapshot;
        this.#selected = snapshot.selected;
        this.#redrawHighlight();
        if (!this.#layout) return;
        this.#applyState(snapshot);
    }

    highlight(index: number | null): void {
        this.#selected = index;
        this.#redrawHighlight();
    }

    celebratePlacement(index: number, shape: ShapeId): void {
        const sprite = this.#cells[index];
        const layout = this.#layout;
        if (!sprite || !layout) return;

        const target = (layout.board.cell - layout.board.inset * 2) / SHAPE_TEXTURE_SIZE;
        const token = this.#markBusy(index);
        const scene = this.#scene;

        scene.tweens.killTweensOf(sprite as unknown as object);
        sprite.setTexture(shapeTextureKey(shape, 'normal')).setVisible(true).setAlpha(1).setAngle(0);
        sprite.setScale(target * 0.2);

        // Squash-and-stretch in: `Back` overshoots on the way, which reads as a bounce.
        scene.tweens.add({ targets: sprite, scale: target, duration: 260, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets: sprite,
            scaleX: target * 1.18,
            scaleY: target * 0.82,
            duration: 90,
            delay: 270,
            yoyo: true,
            ease: 'Sine.easeInOut',
        });

        // A blink so the shape looks pleased with where it landed.
        scene.time.delayedCall(BLINK_AT_MS, () => {
            if (sprite.active) sprite.setTexture(shapeTextureKey(shape, 'blink'));
        });
        scene.time.delayedCall(BLINK_OFF_MS, () => {
            if (sprite.active) sprite.setTexture(shapeTextureKey(shape, 'normal'));
        });
        scene.time.delayedCall(PLACEMENT_BUSY_MS, () => this.#releaseBusy(index, token));
    }

    celebrateMistake(index: number, shape: ShapeId): void {
        const sprite = this.#cells[index];
        const layout = this.#layout;
        if (!sprite || !layout) return;

        const target = (layout.board.cell - layout.board.inset * 2) / SHAPE_TEXTURE_SIZE;
        const token = this.#markBusy(index);
        const scene = this.#scene;

        scene.tweens.killTweensOf(sprite as unknown as object);
        sprite.setTexture(shapeTextureKey(shape, 'surprised')).setVisible(true).setAlpha(1).setScale(target);

        // A wobble rather than an x-shake: the sprite expresses surprise without owning a
        // coordinate that a viewport change could also be writing to.
        scene.tweens.add({
            targets: sprite,
            angle: 7,
            scaleX: target * 1.22,
            duration: 50,
            yoyo: true,
            repeat: 5,
            ease: 'Sine.easeInOut',
        });

        // …then the shape pops back out, leaving the cell empty again.
        scene.tweens.add({
            targets: sprite,
            scale: 0,
            alpha: 0,
            duration: 280,
            delay: 320,
            ease: 'Back.easeIn',
            onComplete: () => {
                sprite.setVisible(false).setAngle(0).setAlpha(1);
                this.#releaseBusy(index, token);
            },
        });
    }

    celebrateLines(lines: readonly LineRef[]): void {
        for (const line of lines) {
            const centre = this.#lineCentre(line);
            if (centre) this.#burst(centre.x, centre.y, this.#lineExtent(line));
        }
    }

    pulseDanger(): void {
        const gfx = this.#dangerGfx;
        const layout = this.#layout;
        if (!gfx || !layout) return;

        gfx.clear();
        gfx.lineStyle(18, PALETTE.danger, 1);
        gfx.strokeRect(0, 0, layout.viewport.width, layout.viewport.height);
        gfx.setAlpha(0);

        this.#scene.tweens.killTweensOf(gfx as unknown as object);
        this.#scene.tweens.add({
            targets: gfx,
            alpha: 0.65,
            duration: 150,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onComplete: () => gfx.setAlpha(0),
        });
    }

    destroy(): void {
        const objects: Phaser.GameObjects.GameObject[] = [
            ...this.#cells,
            ...this.#trayShapes,
            ...this.#trayBadges,
            ...this.#hearts,
            ...this.#confetti,
        ];
        for (const text of [this.#scoreText, this.#levelText, this.#timeText]) if (text) objects.push(text);
        for (const gfx of [this.#boardGfx, this.#highlightGfx, this.#trayGfx, this.#dangerGfx]) if (gfx) objects.push(gfx);
        if (this.#background) objects.push(this.#background);

        for (const object of objects) {
            this.#scene.tweens.killTweensOf(object as unknown as object);
            object.destroy();
        }

        this.#background = null;
        this.#boardGfx = null;
        this.#highlightGfx = null;
        this.#trayGfx = null;
        this.#dangerGfx = null;
        this.#cells = [];
        this.#trayShapes = [];
        this.#trayBadges = [];
        this.#hearts = [];
        this.#confetti = [];
        this.#scoreText = null;
        this.#levelText = null;
        this.#timeText = null;
        this.#snapshot = null;
        this.#layout = null;
        this.#grid = null;
        this.#busy.clear();
    }

    // ---- state -------------------------------------------------------------

    /** Writes the round state into objects that are not currently animating. */
    #applyState(snapshot: RoundSnapshot): void {
        const layout = this.#layout;
        if (!layout) return;

        const cellSpriteScale = (layout.board.cell - layout.board.inset * 2) / SHAPE_TEXTURE_SIZE;

        for (let index = 0; index < this.#cells.length; index++) {
            const sprite = this.#cells[index];
            if (!sprite || this.#busy.has(index)) continue;

            const shape = snapshot.board.cells[index];
            if (shape === null) {
                sprite.setVisible(false);
                continue;
            }
            sprite
                .setTexture(shapeTextureKey(shape, 'normal'))
                .setVisible(true)
                .setAlpha(1)
                .setAngle(0)
                .setScale(cellSpriteScale);
        }

        for (let index = 0; index < this.#trayShapes.length; index++) {
            const needed = snapshot.tray[index] ?? 0;
            const depleted = needed <= 0;
            this.#trayShapes[index]?.setTexture(shapeTextureKey(index, 'normal')).setAlpha(depleted ? 0.3 : 1);
            this.#trayBadges[index]?.setText(String(needed)).setAlpha(depleted ? 0.45 : 1);
        }

        this.#scoreText?.setText(formatScore(snapshot.score));
        this.#levelText?.setText(`Level ${snapshot.level}`);
        this.#timeText?.setText(`${Math.max(0, Math.ceil(snapshot.secondsLeft))}s`);
        // Texture swap, not setTint: the Canvas renderer ignores tint entirely.
        this.#hearts.forEach((heart, index) => {
            heart.setTexture(index < snapshot.hearts ? HEART_KEY : HEART_SPENT_KEY);
        });
    }

    // ---- board -------------------------------------------------------------

    #drawBoard(layout: GameLayout, gridSize: number, grid: Grid): void {
        const gfx = this.#boardGfx;
        if (!gfx) return;
        const { x, y, size, cell, inset } = layout.board;

        gfx.clear();

        const corner = Math.max(4, cell * 0.14);
        gfx.fillStyle(PALETTE.boardFrame, 1);
        gfx.fillRoundedRect(x - 5, y - 5, size + 10, size + 10, corner + 5);

        const face = cell - inset * 2;
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                const index = row * gridSize + col;
                // Alternate tint per box, so the 2×2 and 2×3 groups read at a glance.
                gfx.fillStyle(grid.boxOf[index] % 2 === 1 ? PALETTE.cellAlt : PALETTE.cell, 1);
                gfx.fillRoundedRect(x + col * cell + inset, y + row * cell + inset, face, face, corner);
            }
        }

        // Hairlines inside each box…
        gfx.lineStyle(1, PALETTE.gridLine, 0.65);
        for (let line = 1; line < gridSize; line++) {
            const offset = line * cell;
            gfx.lineBetween(x + offset, y, x + offset, y + size);
            gfx.lineBetween(x, y + offset, x + size, y + offset);
        }

        // …and heavier borders between boxes, which is what makes the groups legible.
        gfx.lineStyle(4, PALETTE.boxBorder, 1);
        for (let line = 1; line < gridSize; line++) {
            const offset = line * cell;
            if ((line + 1) % grid.size.boxRows === 0) gfx.lineBetween(x + offset, y - 2, x + offset, y + size + 2);
            if ((line + 1) % grid.size.boxCols === 0) gfx.lineBetween(x - 2, y + offset, x + size + 2, y + offset);
        }
    }

    #drawTray(layout: GameLayout): void {
        const gfx = this.#trayGfx;
        if (!gfx) return;
        const { tray } = layout;

        gfx.clear();
        for (const slot of tray.slots) {
            const width = tray.slotWidth - 8;
            gfx.fillStyle(PALETTE.boardFrame, 0.9);
            gfx.fillRoundedRect(slot.cx - width / 2, tray.y + 4, width, tray.height - 8, 12);
        }
    }

    #redrawHighlight(): void {
        const gfx = this.#highlightGfx;
        const layout = this.#layout;
        const boardSize = this.#grid;
        if (!gfx || !layout || !boardSize) return;

        gfx.clear();
        const index = this.#selected;
        if (index === null) return;

        const gridSize = boardSize.size;
        const grid = gridFor(boardSize);
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        const boxIndex = grid.boxOf[index];

        const { x, y, cell, inset } = layout.board;
        const face = cell - inset * 2;
        const corner = Math.max(4, cell * 0.14);

        const fillCell = (cellIndex: number, colour: number, alpha: number): void => {
            gfx.fillStyle(colour, alpha);
            gfx.fillRoundedRect(
                x + (cellIndex % gridSize) * cell + inset,
                y + Math.floor(cellIndex / gridSize) * cell + inset,
                face,
                face,
                corner,
            );
        };

        // A soft wash across the cell's row, column and box…
        for (const member of grid.rows[row]) fillCell(member, PALETTE.highlight, 0.16);
        for (const member of grid.cols[col]) fillCell(member, PALETTE.highlight, 0.16);
        for (const member of grid.boxes[boxIndex]) fillCell(member, PALETTE.highlight, 0.16);

        // …and a decisive ring on the cell actually waiting for a shape.
        gfx.lineStyle(3, PALETTE.selection, 1);
        gfx.strokeRoundedRect(x + col * cell + inset, y + row * cell + inset, face, face, corner);
    }

    // ---- celebration -------------------------------------------------------

    #lineCentre(line: LineRef): { x: number; y: number } | null {
        const layout = this.#layout;
        const boardSize = this.#grid;
        if (!layout || !boardSize) return null;
        const { board } = layout;
        const cell = board.cell;

        if (line.kind === 'row') return { x: board.x + board.size / 2, y: board.y + (line.index + 0.5) * cell };
        if (line.kind === 'column') return { x: board.x + (line.index + 0.5) * cell, y: board.y + board.size / 2 };

        const boxesAcross = boardSize.size / boardSize.boxCols;
        return {
            x: board.x + ((line.index % boxesAcross) * boardSize.boxCols + boardSize.boxCols / 2) * cell,
            y: board.y + (Math.floor(line.index / boxesAcross) * boardSize.boxRows + boardSize.boxRows / 2) * cell,
        };
    }

    /** How far confetti should spread for a completed line. */
    #lineExtent(line: LineRef): number {
        const layout = this.#layout;
        const boardSize = this.#grid;
        if (!layout || !boardSize) return 40;
        if (line.kind === 'box') {
            return Math.max(boardSize.boxCols, boardSize.boxRows) * layout.board.cell * 0.5;
        }
        return layout.board.size * 0.34;
    }

    #burst(originX: number, originY: number, radius: number): void {
        if (this.#confetti.length === 0) return;
        const scene = this.#scene;

        for (let i = 0; i < CONFETTI_PER_LINE; i++) {
            const sprite = this.#confetti[this.#confettiCursor % this.#confetti.length];
            this.#confettiCursor += 1;

            // Visual confetti may be random; game logic never is.
            const angle = (i / CONFETTI_PER_LINE) * Math.PI * 2 + Math.random() * 0.5;
            const distance = radius * (0.7 + Math.random() * 0.8);
            const colour = Math.floor(Math.random() * CONFETTI_COLOURS.length);

            scene.tweens.killTweensOf(sprite as unknown as object);
            sprite
                .setVisible(true)
                .setAlpha(1)
                .setScale(1)
                .setAngle(0)
                // Texture swap, not setTint: the Canvas renderer ignores tint entirely.
                .setTexture(confettiTextureKey(colour))
                .setPosition(originX + Math.cos(angle) * 6, originY + Math.sin(angle) * 6);

            scene.tweens.add({
                targets: sprite,
                x: originX + Math.cos(angle) * distance,
                y: originY + Math.sin(angle) * distance + radius * 0.3,
                angle: 120 + Math.random() * 240,
                scale: 0.35,
                alpha: 0,
                duration: 620 + Math.random() * 280,
                ease: 'Cubic.easeOut',
                onComplete: () => sprite.setVisible(false),
            });
        }
    }

    // ---- animation bookkeeping --------------------------------------------

    #markBusy(index: number): unknown {
        const token = Symbol(`busy-${index}`);
        this.#busy.set(index, token);
        return token;
    }

    #releaseBusy(index: number, token: unknown): void {
        if (this.#busy.get(index) === token) this.#busy.delete(index);
    }
}
