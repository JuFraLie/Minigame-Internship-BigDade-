import Phaser from 'phaser';
import { CAR_COLORS } from '../core/config.ts';
import { directionVector } from '../core/ring.ts';
import type { Direction } from '../core/ring.ts';
import { ensureCarTexture, REFERENCE_CELL } from './carTextures.ts';
import { computeBoardLayout } from './layout.ts';
import type { BoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { addText } from './text.ts';
import { THEME } from './theme.ts';
import { createButton } from './widgets.ts';

/**
 * The Play Screen (AGENTS.md §2).
 *
 * Nothing runs until the player acts: the round only starts from here, on the PLAY button
 * or on any tap anywhere on this screen. The first tap of the session is also what
 * `launch` is sent on, exactly once.
 *
 * It carries a two-sentence how-to, because "tap the car you want to move" is not quite
 * self-evident when half the cars are blocked by the other half.
 *
 * Everything it draws lives in one container, so a resize is a redraw rather than a pile
 * of half-orphaned game objects.
 */
export class MenuView {
    private layout: BoardLayout;
    private content: Phaser.GameObjects.Container | null = null;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly onStart: () => void,
    ) {
        scene.cameras.main.setBackgroundColor(THEME.bg);
        this.layout = computeBoardLayout(measureViewport(), 4, 4);
        this.build();
    }

    /** Redraws for the current screen size. The start callback is kept. */
    rebuild(): void {
        this.content?.destroy(true);
        this.content = null;
        this.layout = computeBoardLayout(measureViewport(), this.layout.cols, this.layout.rows);
        this.build();
    }

    private build(): void {
        const { width, height } = this.layout.viewport;
        const cx = width / 2;
        const scene = this.scene;

        const content = scene.add.container(0, 0);
        this.content = content;

        const collect = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
            content.add(object);
            return object;
        };

        collect(
            addText(scene, cx, height * 0.17, 'RING ROAD', {
                fontSize: '52px',
                fontStyle: 'bold',
                color: THEME.text.accent,
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        collect(
            addText(scene, cx, height * 0.17 + 54, 'PARKING', {
                fontSize: '52px',
                fontStyle: 'bold',
                color: THEME.text.primary,
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        collect(
            addText(
                scene,
                cx,
                height * 0.42,
                'Tap a car to send it out onto the ring road.\nDo not hit the cars already circling the lot!',
                { fontSize: '19px', color: THEME.text.muted, align: 'center', wordWrapWidth: width - 48 },
            ).setOrigin(0.5, 0.5),
        );

        this.buildDemoBoard(content, cx, height * 0.63);

        content.add(
            createButton(scene, {
                x: cx,
                y: height * 0.85,
                width: Math.min(280, width - 64),
                height: 74,
                label: 'PLAY',
                variant: 'primary',
                fontSize: '32px',
                onTap: this.onStart,
            }),
        );
    }

    /**
     * A small frozen lot with a ring around it, drawn with the same textures the game
     * uses, so the Play Screen teaches the board before the first tap.
     */
    private buildDemoBoard(content: Phaser.GameObjects.Container, cx: number, cy: number): void {
        const cell = Math.min(this.layout.viewport.width / 7, 46);
        const cols = 3;
        const rows = 3;
        const width = (cols + 2) * cell;
        const height = (rows + 2) * cell;
        const x = cx - width / 2;
        const y = cy - height / 2;

        const g = this.scene.add.graphics();

        // Same flat slab the round draws: soft-cornered road, warmer lane dashes, lighter
        // bay-ruled lot. The Play Screen then teaches the real board, not an older one.
        g.fillStyle(THEME.board.road, 1);
        g.fillRoundedRect(x, y, width, height, cell * 0.42);
        g.lineStyle(2, THEME.board.roadEdge, 1);
        g.strokeRoundedRect(x, y, width, height, cell * 0.42);

        const mark = Math.max(2, cell * 0.07);
        const dash = cell * 0.3;
        const gap = cell * 0.34;
        const corner = cell * 0.9;
        g.fillStyle(THEME.board.lane, 0.5);
        for (let d = corner; d < width - corner; d += dash + gap) {
            g.fillRoundedRect(x + d, y + cell * 0.5 - mark / 2, dash, mark, mark / 2);
            g.fillRoundedRect(x + d, y + height - cell * 0.5 - mark / 2, dash, mark, mark / 2);
        }
        for (let d = corner; d < height - corner; d += dash + gap) {
            g.fillRoundedRect(x + cell * 0.5 - mark / 2, y + d, mark, dash, mark / 2);
            g.fillRoundedRect(x + width - cell * 0.5 - mark / 2, y + d, mark, dash, mark / 2);
        }

        g.fillStyle(THEME.board.lot, 1);
        g.fillRoundedRect(x + cell, y + cell, cols * cell, rows * cell, cell * 0.2);
        g.lineStyle(2, THEME.board.lotEdge, 1);
        g.strokeRoundedRect(x + cell, y + cell, cols * cell, rows * cell, cell * 0.2);

        g.lineStyle(1, THEME.board.lotLine, 0.4);
        for (let c = 1; c < cols; c++) {
            g.lineBetween(
                x + cell + c * cell,
                y + cell + 5,
                x + cell + c * cell,
                y + cell + rows * cell - 5,
            );
        }
        for (let r = 1; r < rows; r++) {
            g.lineBetween(
                x + cell + 5,
                y + cell + r * cell,
                x + cell + cols * cell - 5,
                y + cell + r * cell,
            );
        }
        content.add(g);

        // The seed is what picks each body shape, so the demo shows the variety the player
        // is about to meet rather than three of the same car in different paint. Every
        // demo car is two cells, matching the lot the game generates for every level.
        const demo: {
            col: number;
            row: number;
            dir: Direction;
            length: number;
            color: number;
            seed: number;
        }[] = [
            { col: 1, row: 0, dir: 'up', length: 2, color: CAR_COLORS[0], seed: 1 },
            { col: 0, row: 2, dir: 'left', length: 2, color: CAR_COLORS[3], seed: 4 },
            // Grown from one cell to two: at one cell this bay held a car a fraction the
            // width of its neighbours, which read as a bug rather than as a small vehicle.
            // `down` is what keeps its body clear of the red car at (1,1).
            { col: 2, row: 1, dir: 'down', length: 2, color: CAR_COLORS[1], seed: 7 },
        ];

        for (const car of demo) {
            const key = ensureCarTexture(this.scene, car.color, car.length, car.seed);
            const { dx, dy } = directionVector(car.dir);
            const centreX = x + (car.col - (dx * (car.length - 1)) / 2 + 1.5) * cell;
            const centreY = y + (car.row - (dy * (car.length - 1)) / 2 + 1.5) * cell;
            content.add(
                this.scene.add
                    .sprite(centreX, centreY, key)
                    .setOrigin(0.5, 0.5)
                    .setRotation(Math.atan2(dy, dx))
                    .setScale(cell / REFERENCE_CELL),
            );
        }
    }

    dispose(): void {
        this.content?.destroy(true);
        this.content = null;
    }
}
