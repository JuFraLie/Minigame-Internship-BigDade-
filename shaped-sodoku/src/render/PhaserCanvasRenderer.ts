import Phaser from 'phaser';

import type { BoardSize } from '../domain/Board.ts';
import { gridFor, type Grid } from '../domain/Board.ts';
import type { LineRef } from '../domain/Rules.ts';
import type { RoundSnapshot } from '../domain/ports.ts';
import type { ShapeId } from '../domain/shapes.ts';
import { formatScore } from '../domain/Scoring.ts';
import { darken, drawBevel } from './Chunky.ts';
import type { GameLayout } from './GameLayout.ts';
import { CONFETTI_COLOURS, confettiTextureKey, ensureTextures, HEART_KEY, HEART_SPENT_KEY, SHAPE_TEXTURE_SIZE, shapeTextureKey } from './ShapeTextures.ts';
import { FONT_STACK, DISPLAY_STACK, PALETTE } from './palette.ts';
import type { RenderPort } from './RenderPort.ts';

/** Layers, so a highlight wash never paints over a sprite that belongs above it. */
const DEPTH = {
    background: 0,
    board: 1,
    highlight: 2,
    cells: 3,
    tray: 4,
    trayShapes: 5,
    trayChips: 6,
    trayBadges: 7,
    hudChrome: 8,
    hud: 9,
    danger: 10,
    confetti: 11,
} as const;

const CONFETTI_COUNT = 48;
const CONFETTI_PER_LINE = 14;
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
    #hudGfx: Phaser.GameObjects.Graphics | null = null;
    #dangerGfx: Phaser.GameObjects.Graphics | null = null;

    #cells: Phaser.GameObjects.Image[] = [];
    #trayShapes: Phaser.GameObjects.Image[] = [];
    #trayChips: Phaser.GameObjects.Graphics[] = [];
    #trayBadges: Phaser.GameObjects.Text[] = [];
    #hearts: Phaser.GameObjects.Image[] = [];
    #confetti: Phaser.GameObjects.Image[] = [];
    #confettiCursor = 0;
    #scoreText: Phaser.GameObjects.Text | null = null;
    #levelText: Phaser.GameObjects.Text | null = null;
    #timeText: Phaser.GameObjects.Text | null = null;

    /**
     * What the HUD said on the previous pass, so a change can be *felt* rather than merely
     * shown: a heart that just went out is bumped, a score that just moved is popped. Both
     * compare against the last value written, so a resize — which redraws without changing
     * anything — can never fire them.
     */
    #lastHearts: number | null = null;
    #lastScore: number | null = null;
    /** Resting heart scale, re-derived on every layout so the bump always returns to it. */
    #heartBase = 0.3;

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
        this.#hudGfx = scene.add.graphics().setDepth(DEPTH.hudChrome);
        this.#dangerGfx = scene.add.graphics().setDepth(DEPTH.danger).setAlpha(0);

        const shapeCount = Math.min(grid.size, 6);

        this.#cells = Array.from({ length: grid.size * grid.size }, () =>
            scene.add.image(0, 0, 'shape-0-normal').setDepth(DEPTH.cells).setVisible(false),
        );
        this.#trayShapes = Array.from({ length: shapeCount }, () =>
            scene.add.image(0, 0, shapeTextureKey(0, 'normal')).setDepth(DEPTH.trayShapes),
        );
        // The remaining-count coin sits under the numeral it belongs to; both are made here
        // so a depleted slot can dim them together.
        this.#trayChips = Array.from({ length: shapeCount }, () =>
            scene.add.graphics().setDepth(DEPTH.trayChips),
        );
        this.#trayBadges = Array.from({ length: shapeCount }, () =>
            scene.add
                .text(0, 0, '0', {
                    fontFamily: DISPLAY_STACK,
                    fontSize: '14px',
                    fontStyle: 'bold',
                    color: '#15183c',
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

        // The wash bleeds past every edge. The camera shakes on a mistake, and without the
        // bleed a shake would drag bare canvas in at the sides.
        const BLEED = 0.04;
        this.#background
            ?.setPosition(-viewport.width * BLEED, -viewport.height * BLEED)
            .setDisplaySize(viewport.width * (1 + BLEED * 2), viewport.height * (1 + BLEED * 2));

        this.#drawBoard(layout, gridSize, grid);
        this.#drawTray(layout);

        // Level labels the left, score takes centre stage, clock and hearts hold the right.
        const hudMidY = hud.y + hud.height / 2;
        const scoreFont = Math.round(hud.height * 0.6);
        this.#scoreText?.setPosition(viewport.width / 2, hudMidY).setFontSize(scoreFont);
        this.#levelText?.setPosition(viewport.width * 0.06, hudMidY).setFontSize(Math.round(hud.height * 0.3));
        this.#levelText?.setVisible(true);

        this.#heartBase = Math.max(0.24, Math.min(0.4, hud.height * 0.0068));
        const heartGap = Math.max(17, hud.height * 0.44);
        const heartsWidth = heartGap * (this.#hearts.length - 1);
        const heartsRight = viewport.width * 0.94;
        this.#hearts.forEach((heart, index) => {
            heart.setPosition(heartsRight - heartsWidth + index * heartGap, hudMidY).setScale(this.#heartBase);
        });

        this.#timeText?.setFontSize(Math.round(hud.height * 0.27));
        this.#timeText?.setPosition(heartsRight - heartsWidth - heartGap * 0.8, hudMidY);

        this.#drawHud(layout);

        const badgeFont = Math.max(11, Math.round(hud.height * 0.27));
        const chipRadius = badgeFont * 0.98;
        this.#cells.forEach((cell, index) => {
            cell.setPosition(
                board.x + (index % gridSize) * board.cell + board.cell / 2,
                board.y + Math.floor(index / gridSize) * board.cell + board.cell / 2,
            );
            // Never write scale under a running tween — the animation owns it until it ends.
            if (!this.#busy.has(index)) cell.setScale(cellSpriteScale);
        });

        tray.slots.forEach((slot, index) => {
            const badgeX = slot.cx + tray.slotWidth * 0.3;
            const badgeY = tray.y + tray.height * 0.22;

            this.#trayShapes[index]?.setPosition(slot.cx, slot.cy).setScale((slot.radius * 2) / SHAPE_TEXTURE_SIZE);
            this.#trayBadges[index]?.setPosition(badgeX, badgeY).setFontSize(badgeFont);

            const chip = this.#trayChips[index];
            if (chip) {
                chip.clear();
                chip.setPosition(badgeX, badgeY);
                drawBevel(chip, -chipRadius, -chipRadius, chipRadius * 2, chipRadius * 2, chipRadius, {
                    fill: PALETTE.gold,
                    depth: 3,
                    outline: PALETTE.ink,
                    outlineWidth: 2.5,
                    gloss: 0.22,
                });
            }
        });

        this.#redrawHighlight();
        if (this.#snapshot) this.#applyState(this.#snapshot);
    }

    /**
     * Three capsules behind the HUD — level, score, clock-and-hearts — so the strip reads as
     * furniture bolted to the screen rather than three pieces of loose text.
     *
     * Drawn last of the chrome because it measures the labels it sits behind: their widths
     * are only known once their font sizes have just been set.
     */
    #drawHud(layout: GameLayout): void {
        const gfx = this.#hudGfx;
        const level = this.#levelText;
        const score = this.#scoreText;
        const time = this.#timeText;
        const lastHeart = this.#hearts[this.#hearts.length - 1];
        if (!gfx || !level || !score || !time || !lastHeart) return;

        const { viewport, hud } = layout;
        const midY = hud.y + hud.height / 2;
        const padX = Math.max(9, hud.height * 0.2);
        const pillHeight = Math.max(score.height + 14, hud.height * 0.92);

        gfx.clear();

        const capsule = (left: number, right: number): void => {
            const width = Math.max(30, right - left);
            drawBevel(gfx, left, midY - pillHeight / 2, width, pillHeight, pillHeight / 2, {
                fill: PALETTE.hudPill,
                depth: 3,
                outline: PALETTE.hudPillEdge,
                outlineWidth: 2,
                gloss: 0.14,
            });
        };

        capsule(viewport.width * 0.03, level.x + level.width + padX);

        // A single digit otherwise squeezes this into a circle that reads as a bubble
        // rather than a capsule, so the pill keeps a floor of roughly 2.3:1.
        const scoreWidth = Math.max(score.width + padX * 3, pillHeight * 2.3);
        capsule(viewport.width / 2 - scoreWidth / 2, viewport.width / 2 + scoreWidth / 2);

        capsule(time.x - time.width - padX, lastHeart.x + lastHeart.displayWidth * 0.5 + 6);
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

        // The screen flinches with it. `main` is already gone if a mistake lands on the very
        // frame the scene is shutting down on, which is the one case this could still run.
        this.#scene.cameras?.main?.shake(150, 0.006);

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
            ...this.#trayChips,
            ...this.#trayBadges,
            ...this.#hearts,
            ...this.#confetti,
        ];
        for (const text of [this.#scoreText, this.#levelText, this.#timeText]) if (text) objects.push(text);
        for (const gfx of [this.#boardGfx, this.#highlightGfx, this.#trayGfx, this.#hudGfx, this.#dangerGfx])
            if (gfx) objects.push(gfx);
        if (this.#background) objects.push(this.#background);

        for (const object of objects) {
            this.#scene.tweens.killTweensOf(object as unknown as object);
            object.destroy();
        }

        this.#background = null;
        this.#boardGfx = null;
        this.#highlightGfx = null;
        this.#trayGfx = null;
        this.#hudGfx = null;
        this.#dangerGfx = null;
        this.#cells = [];
        this.#trayShapes = [];
        this.#trayChips = [];
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
        this.#lastHearts = null;
        this.#lastScore = null;
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
            this.#trayChips[index]?.setAlpha(depleted ? 0.35 : 1);
        }

        this.#scoreText?.setText(formatScore(snapshot.score));
        this.#levelText?.setText(`Level ${snapshot.level}`);
        this.#timeText?.setText(`${Math.max(0, Math.ceil(snapshot.secondsLeft))}s`);
        // Texture swap, not setTint: the Canvas renderer ignores tint entirely.
        this.#hearts.forEach((heart, index) => {
            heart.setTexture(index < snapshot.hearts ? HEART_KEY : HEART_SPENT_KEY);
        });

        // Feel the change, don't merely show it. Both compare against the previous value,
        // so the tick that follows a resize — same numbers, new geometry — stays still.
        if (this.#lastScore !== null && snapshot.score !== this.#lastScore) this.#popScore();
        this.#lastScore = snapshot.score;

        if (this.#lastHearts !== null && snapshot.hearts < this.#lastHearts) {
            const justLost = this.#hearts[snapshot.hearts];
            if (justLost) this.#bumpHeart(justLost);
        }
        this.#lastHearts = snapshot.hearts;

        // Last, because the capsules hug whatever the labels just became: sized once at
        // creation they would keep a clock-sized hole around an empty string forever.
        this.#drawHud(layout);
    }

    /** Throws a spent heart outward, so losing one lands as a physical event. */
    #bumpHeart(heart: Phaser.GameObjects.Image): void {
        const scene = this.#scene;
        const base = this.#heartBase;

        scene.tweens.killTweensOf(heart as unknown as object);
        scene.tweens.add({
            targets: heart,
            scale: base * 1.8,
            duration: 150,
            yoyo: true,
            ease: 'Back.easeOut',
            onComplete: () => heart.setScale(base),
        });
        scene.tweens.add({
            targets: heart,
            angle: 18,
            duration: 90,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut',
            onComplete: () => heart.setAngle(0),
        });
    }

    /** The score figure briefly larger than it is, so a move registers without being read. */
    #popScore(): void {
        const text = this.#scoreText;
        if (!text) return;

        const scene = this.#scene;
        scene.tweens.killTweensOf(text as unknown as object);
        scene.tweens.add({
            targets: text,
            scale: 1.25,
            duration: 120,
            yoyo: true,
            ease: 'Back.easeOut',
            onComplete: () => text.setScale(1),
        });
    }

    // ---- board -------------------------------------------------------------

    #drawBoard(layout: GameLayout, gridSize: number, grid: Grid): void {
        const gfx = this.#boardGfx;
        if (!gfx) return;
        const { x, y, size, cell, inset } = layout.board;

        gfx.clear();

        const corner = Math.max(5, cell * 0.16);
        const frame = 6;
        const frameWidth = size + frame * 2;
        const frameHeight = size + frame * 2;

        // Shadow first, dropped straight down. The x is left alone so it can never peek out
        // at the sides: the board sits on the screen rather than hovering above it.
        gfx.fillStyle(PALETTE.drop, 0.36);
        gfx.fillRoundedRect(x - frame, y - frame + 8, frameWidth, frameHeight, corner + frame);

        gfx.fillStyle(PALETTE.boardFrame, 1);
        gfx.fillRoundedRect(x - frame, y - frame, frameWidth, frameHeight, corner + frame);
        gfx.lineStyle(4, PALETTE.boardEdge, 1);
        gfx.strokeRoundedRect(x - frame, y - frame, frameWidth, frameHeight, corner + frame);

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
            const width = tray.slotWidth - 9;
            const height = tray.height - 12;
            // Sized from the slot's own centre, so the shape inside is centred in the well
            // it sits in rather than floating above the drop shadow.
            drawBevel(gfx, slot.cx - width / 2, slot.cy - height / 2, width, height, Math.min(16, height * 0.32), {
                fill: PALETTE.traySlot,
                depth: 5,
                drop: 4,
                outline: PALETTE.traySlotEdge,
                outlineWidth: 2.5,
                gloss: 0.14,
            });
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
        const corner = Math.max(5, cell * 0.16);

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

        // …and a decisive ring on the cell actually waiting for a shape. Two passes: a fat
        // darker ring underneath, a crisp one on top, which is what makes the selection read
        // as pressed into the board rather than drawn on it.
        const ring = (thickness: number, colour: number, alpha: number): void => {
            gfx.lineStyle(thickness, colour, alpha);
            gfx.strokeRoundedRect(x + col * cell + inset, y + row * cell + inset, face, face, corner);
        };
        ring(7, darken(PALETTE.selection, 0.35), 1);
        ring(3.5, PALETTE.selection, 1);
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
