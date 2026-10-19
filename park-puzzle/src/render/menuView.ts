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
import { paintRoundedBox } from './widgets.ts';

/**
 * The Play Screen (AGENTS.md §2).
 *
 * Nothing runs until the player acts: the round only starts from here, on the MAIN button
 * or on any tap anywhere on this screen. The first tap of the session is also what
 * `launch` is sent on, exactly once.
 *
 * It carries a two-sentence how-to (in Indonesian, like every string on this screen),
 * because "tap the car you want to move" is not quite self-evident when half the cars are
 * blocked by the other half.
 *
 * This is the one screen that leaves the light chrome behind: a dusk sky with a slow
 * sunburst behind the logo, and every chunk of UI drawn with the same heavy dark outline,
 * an extruded shadow edge and a slight tilt — the arcade sticker look the rest of the game
 * does not have. Copy is wrapped and measured before the card is drawn, so a narrow screen
 * grows the card instead of clipping a line.
 *
 * Everything it draws lives in one container, so a resize is a redraw rather than a pile
 * of half-orphaned game objects. The idle loops it starts are stopped before that redraw.
 */
export class MenuView {
    private layout: BoardLayout;
    private content: Phaser.GameObjects.Container | null = null;
    /** Idle loops started by the last draw — a rebuild must stop them before it destroys what they drive. */
    private loops: Phaser.Tweens.Tween[] = [];

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly onStart: () => void,
    ) {
        scene.cameras.main.setBackgroundColor(THEME.menu.sky[0]);
        this.layout = computeBoardLayout(measureViewport(), 4, 4);
        this.build();
    }

    /** Redraws for the current screen size. The start callback is kept. */
    rebuild(): void {
        this.teardown();
        this.layout = computeBoardLayout(measureViewport(), this.layout.cols, this.layout.rows);
        this.build();
    }

    private build(): void {
        const { width, height } = this.layout.viewport;
        const cx = width / 2;
        const scene = this.scene;

        const content = scene.add.container(0, 0);
        this.content = content;

        this.buildBackdrop(content, width, height);

        // The card hangs off the bottom of the logo rather than off a fixed percentage: the
        // title sizes itself to the screen, and its drop-down plate moves with it.
        const titleBottom = this.buildLogo(content, cx, height * 0.13);
        const cardTop = Math.max(titleBottom + 34, height * 0.26);
        const cardHeight = this.buildHowTo(content, cx, cardTop);

        // The demo lot takes whatever is left between the card and the button, so the three
        // never crowd each other on a short or unusually tall screen.
        const buttonY = height * 0.845;
        const buttonHeight = 76;
        this.buildDemoBoard(
            content,
            cx,
            cardTop + cardHeight + 22,
            buttonY - buttonHeight / 2 - 18,
        );
        this.buildPlayButton(content, cx, buttonY, buttonHeight);
        this.buildHint(content, cx, height * 0.94);
    }

    /**
     * Dusk sky, a slow sunburst behind the logo and a few twinkling specks.
     *
     * The gradient is painted as stepped bands on purpose: `fillGradientStyle` is WebGL
     * only and this game renders on Canvas, where it would come out as a flat colour.
     */
    private buildBackdrop(content: Phaser.GameObjects.Container, width: number, height: number): void {
        const scene = this.scene;
        const [top, middle, bottom] = THEME.menu.sky;

        const sky = scene.add.graphics();
        const bands = 32;
        const bandHeight = height / bands;
        for (let i = 0; i < bands; i += 1) {
            const t = i / (bands - 1);
            sky.fillStyle(t < 0.5 ? mixColor(top, middle, t * 2) : mixColor(middle, bottom, (t - 0.5) * 2), 1);
            // One px past the band: adjoining rects otherwise leave hairline seams.
            sky.fillRect(0, i * bandHeight, width, bandHeight + 1);
        }
        content.add(sky);

        const cx = width / 2;
        const logoY = height * 0.13;
        const reach = Math.hypot(width, height);
        const rays = scene.add.graphics();
        rays.fillStyle(THEME.menu.ray, 0.09);
        const wedges = 18;
        for (let i = 0; i < wedges; i += 1) {
            const from = (i / wedges) * Math.PI * 2;
            const to = from + (Math.PI * 2) / (wedges * 2);
            rays.beginPath();
            rays.moveTo(0, 0);
            rays.lineTo(Math.cos(from) * reach, Math.sin(from) * reach);
            rays.lineTo(Math.cos(to) * reach, Math.sin(to) * reach);
            rays.closePath();
            rays.fillPath();
        }
        rays.setPosition(cx, logoY);
        content.add(rays);
        this.loops.push(
            scene.tweens.add({
                targets: rays,
                angle: 360,
                duration: 120000,
                repeat: -1,
                ease: 'Linear',
            }),
        );

        // Specks only where the UI never sits: the top band, the side gutters, the footer.
        const specks: [number, number][] = [
            [0.1, 0.05], [0.3, 0.03], [0.7, 0.04], [0.9, 0.06],
            [0.05, 0.15], [0.95, 0.16],
            [0.04, 0.36], [0.96, 0.42],
            [0.05, 0.63], [0.95, 0.67],
            [0.06, 0.8], [0.94, 0.85],
            [0.16, 0.965], [0.84, 0.97],
        ];
        specks.forEach(([fx, fy], i) => {
            const radius = 4 + (i % 3) * 2;
            const star = scene.add.graphics();
            star.fillStyle(THEME.menu.star, 0.85);
            star.beginPath();
            star.moveTo(0, -radius);
            star.lineTo(radius * 0.3, -radius * 0.3);
            star.lineTo(radius, 0);
            star.lineTo(radius * 0.3, radius * 0.3);
            star.lineTo(0, radius);
            star.lineTo(-radius * 0.3, radius * 0.3);
            star.lineTo(-radius, 0);
            star.lineTo(-radius * 0.3, -radius * 0.3);
            star.closePath();
            star.fillPath();
            star.setPosition(fx * width, fy * height);
            content.add(star);
            this.loops.push(
                scene.tweens.add({
                    targets: star,
                    alpha: { from: 1, to: 0.3 },
                    duration: 1100 + (i % 4) * 260,
                    delay: i * 190,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                }),
            );
        });
    }

    /**
     * Logo lockup: a stroked line, then the accent line on a chunky amber plate that hangs
     * at a slight tilt. Returns the plate's bottom edge so the how-to can hang off it.
     */
    private buildLogo(content: Phaser.GameObjects.Container, cx: number, y: number): number {
        const scene = this.scene;
        const maxWidth = this.layout.viewport.width - 28;

        const lineOne = addText(scene, cx, y, 'RING ROAD', {
            fontSize: '46px',
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 9,
            letterSpacing: 3,
            shadow: { x: 0, y: 5, color: THEME.menu.shadowCss },
        }).setOrigin(0.5, 0.5);
        // A narrow phone reports an aspect down to 0.42, so the wordmark steps down until
        // it fits rather than running off both edges.
        let size = 46;
        while (lineOne.width > maxWidth && size > 26) {
            size -= 2;
            lineOne.setFontSize(size);
        }
        content.add(lineOne);

        const lineTwo = addText(scene, 0, 0, 'PARKING', {
            fontSize: `${size}px`,
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 9,
            letterSpacing: 3,
            shadow: { x: 0, y: 5, color: THEME.menu.shadowCss },
        }).setOrigin(0.5, 0.5);
        const plateWidth = lineTwo.width + 44;
        const plateHeight = lineTwo.height + 12;
        const plateY = y + 54;

        // `setAngle` in degrees: `setRotation` would take radians and stand the plate up.
        const plate = scene.add.container(cx, plateY).setAngle(-1.6);
        const plateGraphics = scene.add.graphics();
        plateGraphics.fillStyle(THEME.menu.ink, 1);
        plateGraphics.fillRoundedRect(-plateWidth / 2, -plateHeight / 2 + 8, plateWidth, plateHeight, 16);
        paintRoundedBox(plateGraphics, -plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 16, THEME.menu.plate, THEME.menu.ink, 1, 4);
        plateGraphics.fillStyle(0xffffff, 0.24);
        plateGraphics.fillRoundedRect(-plateWidth / 2 + 6, -plateHeight / 2 + 5, plateWidth - 12, plateHeight * 0.36, { tl: 12, tr: 12, br: 4, bl: 4 });
        plate.add(plateGraphics);
        plate.add(lineTwo);
        content.add(plate);

        this.loops.push(
            scene.tweens.add({
                targets: lineOne,
                y: y - 6,
                duration: 1700,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );
        this.loops.push(
            scene.tweens.add({
                targets: plate,
                scaleX: { from: 1, to: 1.04 },
                scaleY: { from: 1, to: 1.04 },
                duration: 950,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );

        return plateY + plateHeight / 2;
    }

    /**
     * The how-to, on a tilted sticker card with a tab and extruded step badges.
     * Returns the card's height, measured from the lines it actually has to hold.
     */
    private buildHowTo(content: Phaser.GameObjects.Container, cx: number, top: number): number {
        const scene = this.scene;
        const cardWidth = Math.min(this.layout.viewport.width - 24, 460);
        const wrapWidth = cardWidth - 76;

        const steps = [
            'Ketuk mobil untuk keluar ke jalan.',
            'Hindari mobil yang sedang melintas!',
        ];

        // Measure before drawing: the card is sized by the lines it ends up holding, so a
        // narrow screen wraps and grows instead of clipping the second row.
        const rows = steps.map((line) =>
            addText(scene, 0, 0, line, {
                fontSize: '15px',
                color: THEME.menu.cardInkCss,
                wordWrapWidth: wrapWidth,
            }).setOrigin(0, 0.5),
        );
        const rowHeights = rows.map((row) => Math.max(26, row.height));
        const padTop = 34;
        const padBottom = 18;
        const gap = 16;
        const cardHeight =
            padTop + rowHeights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1) + padBottom;

        const card = scene.add.container(cx, top + cardHeight / 2).setAngle(-1.3);
        content.add(card);

        const cardGraphics = scene.add.graphics();
        cardGraphics.fillStyle(THEME.menu.ink, 1);
        cardGraphics.fillRoundedRect(-cardWidth / 2 + 7, -cardHeight / 2 + 9, cardWidth, cardHeight, 20);
        paintRoundedBox(cardGraphics, -cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 20, THEME.menu.card, THEME.menu.ink, 1, 4);
        card.add(cardGraphics);

        const tabLabel = addText(scene, 0, 0, 'CARA MAIN', {
            fontSize: '13px',
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 3,
            letterSpacing: 1,
        }).setOrigin(0.5, 0.5);
        const tabWidth = tabLabel.width + 26;
        const tabX = -cardWidth / 2 + 20;
        const tabY = -cardHeight / 2 - 16;

        const tabGraphics = scene.add.graphics();
        tabGraphics.fillStyle(THEME.menu.ink, 1);
        tabGraphics.fillRoundedRect(tabX + 4, tabY + 5, tabWidth, 30, 9);
        paintRoundedBox(tabGraphics, tabX, tabY, tabWidth, 30, 9, THEME.menu.plate, THEME.menu.ink, 1, 3);
        card.add(tabGraphics);
        tabLabel.setPosition(tabX + tabWidth / 2, tabY + 15);
        card.add(tabLabel);

        let cursor = -cardHeight / 2 + padTop;
        rows.forEach((row, i) => {
            const rowY = cursor + rowHeights[i] / 2;
            const badgeX = -cardWidth / 2 + 22;
            const badgeSize = 26;
            const badgeColour = THEME.menu.badge[i % THEME.menu.badge.length];

            const badge = scene.add.graphics();
            badge.fillStyle(THEME.menu.ink, 1);
            badge.fillRoundedRect(badgeX + 3, rowY - badgeSize / 2 + 4, badgeSize, badgeSize, 8);
            paintRoundedBox(badge, badgeX, rowY - badgeSize / 2, badgeSize, badgeSize, 8, badgeColour, THEME.menu.ink, 1, 3);
            card.add(badge);
            card.add(
                addText(scene, badgeX + badgeSize / 2, rowY, String(i + 1), {
                    fontSize: '15px',
                    fontStyle: 'bold',
                    color: THEME.menu.logoInk,
                    align: 'center',
                }).setOrigin(0.5, 0.5),
            );

            row.setPosition(badgeX + badgeSize + 14, rowY);
            card.add(row);
            cursor += rowHeights[i] + gap;
        });

        return cardHeight;
    }

    /**
     * A small frozen lot with a ring around it, drawn with the same textures the game
     * uses, so the Play Screen teaches the board before the first tap. It floats on a
     * chunky extruded slab, the way a mobile game shows off its board, centred in whatever
     * gap the how-to card and the button left between them.
     */
    private buildDemoBoard(
        content: Phaser.GameObjects.Container,
        cx: number,
        top: number,
        bottom: number,
    ): void {
        const scene = this.scene;
        const cols = 3;
        const rows = 3;
        const room = bottom - top;
        const cell = Math.min(this.layout.viewport.width / 7, 58, room / (rows + 2));
        // A screen too short to hold a legible lot gets no demo rather than a shrunken one.
        if (cell < 26) return;

        const width = (cols + 2) * cell;
        const height = (rows + 2) * cell;
        const x = -width / 2;
        const y = -height / 2;
        const boardY = top + Math.max(0, (room - height) / 2) + height / 2;

        const board = scene.add.container(cx, boardY);
        content.add(board);

        const g = scene.add.graphics();

        // Same flat slab the round draws: soft-cornered road, warmer lane dashes, lighter
        // bay-ruled lot. The Play Screen then teaches the real board, not an older one.
        g.fillStyle(THEME.menu.ink, 1);
        g.fillRoundedRect(x + 7, y + 10, width, height, cell * 0.42);
        g.fillStyle(THEME.board.road, 1);
        g.fillRoundedRect(x, y, width, height, cell * 0.42);
        g.lineStyle(4, THEME.menu.ink, 1);
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
        board.add(g);

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
            board.add(
                this.scene.add
                    .sprite(centreX, centreY, key)
                    .setOrigin(0.5, 0.5)
                    .setRotation(Math.atan2(dy, dx))
                    .setScale(cell / REFERENCE_CELL),
            );
        }

        this.loops.push(
            scene.tweens.add({
                targets: board,
                y: boardY - 7,
                duration: 2400,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );
        this.loops.push(
            scene.tweens.add({
                targets: board,
                angle: { from: -1.6, to: 1.6 },
                duration: 3800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );
    }

    /**
     * MAIN: a pressed slab with an extruded edge, a glossy top half and a stroked label —
     * built here rather than through `createButton` because this screen's buttons are the
     * only ones that wear the arcade outline.
     */
    private buildPlayButton(
        content: Phaser.GameObjects.Container,
        cx: number,
        y: number,
        height: number,
    ): void {
        const scene = this.scene;
        const width = Math.min(300, this.layout.viewport.width - 48);
        const radius = 22;

        const container = scene.add.container(cx, y);
        const graphics = scene.add.graphics();

        graphics.fillStyle(THEME.menu.ink, 1);
        graphics.fillRoundedRect(-width / 2, -height / 2 + 9, width, height, radius);
        paintRoundedBox(graphics, -width / 2, -height / 2, width, height, radius, THEME.menu.goBottom, THEME.menu.ink, 1, 5);
        graphics.fillStyle(THEME.menu.goTop, 1);
        graphics.fillRoundedRect(-width / 2 + 6, -height / 2 + 6, width - 12, height * 0.4, { tl: 16, tr: 16, br: 5, bl: 5 });
        container.add(graphics);

        const label = addText(scene, 0, -1, 'MULAI', {
            fontSize: '34px',
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 7,
            letterSpacing: 4,
            shadow: { x: 0, y: 4, color: THEME.menu.shadowCss },
        }).setOrigin(0.5, 0.5);
        container.add(label);

        container.setSize(width, height);
        // Phaser normalises a hit test by the game object's `displayOrigin`, which for a
        // Container is always `width * 0.5` / `height * 0.5`. The point handed to the hit
        // area is therefore top-left relative, not centre relative, so the area runs from
        // (0, 0) to (width, height) — exactly the box that was drawn above. Offsetting it
        // by half the size again would leave only the top-left quarter of the button
        // tappable, which reads on a touchscreen as "the button does not respond".
        container.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, width, height),
            Phaser.Geom.Rectangle.Contains,
        );
        container.on('pointerdown', () => {
            scene.tweens.add({
                targets: container,
                scaleX: 0.95,
                scaleY: 0.95,
                duration: 60,
                yoyo: true,
                ease: 'Quad.easeOut',
            });
            this.onStart();
        });
        content.add(container);

        // The bob runs on `y` and the press on `scale`, so the two never fight over the
        // same property — and the button reads as pressable before it is ever pressed.
        this.loops.push(
            scene.tweens.add({
                targets: container,
                y: y - 6,
                duration: 1150,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );
    }

    /** The line under the button, blinking so the "tap anywhere" rule cannot be missed. */
    private buildHint(content: Phaser.GameObjects.Container, cx: number, y: number): void {
        const scene = this.scene;
        const hint = addText(scene, cx, y, 'Ketuk di mana saja untuk mulai', {
            fontSize: '14px',
            fontStyle: 'bold',
            color: THEME.menu.hintCss,
            align: 'center',
            letterSpacing: 1,
            shadow: { x: 0, y: 2, color: THEME.menu.shadowCss, stroke: false },
        }).setOrigin(0.5, 0.5);
        content.add(hint);

        this.loops.push(
            scene.tweens.add({
                targets: hint,
                alpha: { from: 1, to: 0.4 },
                duration: 850,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );
    }

    dispose(): void {
        this.teardown();
    }

    /** Stops the idle loops first: a tween left running would drive a destroyed object. */
    private teardown(): void {
        for (const loop of this.loops) loop.stop();
        this.loops = [];
        this.content?.destroy(true);
        this.content = null;
    }
}

/** Linear blend between two `0xrrggbb` values — the Canvas fallback for a gradient fill. */
function mixColor(from: number, to: number, t: number): number {
    const channel = (shift: number): number => {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        return Math.round(a + (b - a) * t);
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
