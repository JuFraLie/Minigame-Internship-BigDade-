import Phaser from 'phaser';
import { CAR_COLORS } from '../core/config.ts';
import { directionVector } from '../core/ring.ts';
import type { Direction } from '../core/ring.ts';
import { ensureCarTexture, REFERENCE_CELL } from './carTextures.ts';
import { computeBoardLayout } from './layout.ts';
import type { BoardLayout } from './layout.ts';
import { measureViewport } from './viewport.ts';
import { addText } from './text.ts';
import { createButton } from './widgets.ts';

const SKY = 0x1d2530;

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
        scene.cameras.main.setBackgroundColor(SKY);
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
                color: '#ffd166',
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        collect(
            addText(scene, cx, height * 0.17 + 54, 'PARKING', {
                fontSize: '52px',
                fontStyle: 'bold',
                color: '#ffffff',
                align: 'center',
            }).setOrigin(0.5, 0.5),
        );

        collect(
            addText(
                scene,
                cx,
                height * 0.42,
                'Tap a car to send it out onto the ring road.\nDo not hit the cars already circling the lot!',
                { fontSize: '19px', color: '#c7d0da', align: 'center', wordWrapWidth: width - 48 },
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
                fill: 0x2ecc71,
                stroke: 0x27ae60,
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
        g.fillStyle(0x2f3a46, 1);
        g.fillRect(x, y, width, height);
        g.lineStyle(2, 0x3f4d5c, 1);
        g.strokeRect(x + cell * 0.15, y + cell * 0.15, width - cell * 0.3, height - cell * 0.3);
        g.fillStyle(0x59626d, 1);
        g.fillRect(x + cell, y + cell, cols * cell, rows * cell);
        g.lineStyle(2, 0x78828e, 1);
        g.strokeRect(x + cell, y + cell, cols * cell, rows * cell);
        content.add(g);

        const demo: { col: number; row: number; dir: Direction; length: number; color: number }[] = [
            { col: 1, row: 0, dir: 'up', length: 2, color: CAR_COLORS[0] },
            { col: 0, row: 2, dir: 'left', length: 2, color: CAR_COLORS[3] },
            { col: 2, row: 1, dir: 'right', length: 1, color: CAR_COLORS[1] },
        ];

        for (const car of demo) {
            const key = ensureCarTexture(this.scene, car.color, car.length);
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
