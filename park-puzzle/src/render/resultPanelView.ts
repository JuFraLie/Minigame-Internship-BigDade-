import Phaser from 'phaser';
import type { RoundResult } from '../app/roundSession.ts';
import { mixColor } from './color.ts';
import { measureViewport } from './viewport.ts';
import { addText } from './text.ts';
import { THEME } from './theme.ts';
import { createArcadeButton, paintRoundedBox } from './widgets.ts';

export interface ResultActions {
    /** Win only: the next level. */
    onNextLevel: () => void;
    /** Loss only: the same level again, straight back into gameplay. */
    onRetry: () => void;
    /** Either way: reports the session to the host and does nothing else. */
    onExit: () => void;
}

/** Every number this screen sizes itself with, resolved once from the viewport. */
interface Metrics {
    width: number;
    height: number;
    cx: number;
    /** Top of the stack, below the cutout. */
    top: number;
    /** True on a short or narrow phone: smaller type, tighter gaps, shorter buttons. */
    compact: boolean;
    cardWidth: number;
    maxWidth: number;
}

/**
 * The Result Panel (AGENTS.md §2).
 *
 * It appears only once the round has ended and the score has been finalised and reported,
 * and it is the only screen that offers Next Level, Retry or Exit. Retry goes straight
 * back to gameplay — the Play Screen never replays.
 *
 * It wears the same arcade sticker look as every other screen — dusk sky, sunburst, chunky
 * ink outlines, extruded shadow edges and a tilt — so the round ends on the style the player
 * has been looking at the whole time rather than on a panel that arrives in a different key.
 *
 * Nothing here is pinned to a percentage of the screen. Every piece is measured as it is
 * built and hung off a running cursor, and the finished stack is scaled down only if it
 * genuinely does not fit, so a short or narrow phone gets a smaller panel rather than
 * colliding buttons. The scale applies to the whole container, so the hit areas ride
 * along with what the player can see.
 */
export class ResultPanel {
    private container: Phaser.GameObjects.Container | null = null;
    private readonly scene: Phaser.Scene;
    private readonly result: RoundResult;
    private readonly actions: ResultActions;
    /** Resolved from the viewport on every build; the backdrop reads it too. */
    private metrics!: Metrics;
    /** The sunburst, positioned once the stack is laid out — it must sit behind the badge. */
    private rays: Phaser.GameObjects.Graphics | null = null;
    /** Idle loops — the sunburst, the twinkle, the primary button's bob. */
    private readonly loops: Phaser.Tweens.Tween[] = [];

    constructor(scene: Phaser.Scene, result: RoundResult, actions: ResultActions) {
        this.scene = scene;
        this.result = result;
        this.actions = actions;
        this.build();
    }

    /** Redraws for the current screen size. The result and the callbacks are kept. */
    rebuild(): void {
        this.teardown();
        this.build();
    }

    private build(): void {
        const scene = this.scene;
        const viewport = measureViewport();
        const compact = viewport.width < 380 || viewport.height < 680;
        this.metrics = {
            width: viewport.width,
            height: viewport.height,
            cx: viewport.width / 2,
            top: viewport.safeTop + (compact ? 6 : 12),
            compact,
            cardWidth: Math.min(340, viewport.width - 28),
            maxWidth: viewport.width - 24,
        };

        // The sky replaces the old win/loss wash entirely: the verdict is carried by the
        // badge, the sunburst tint and the headline instead of by the whole backdrop.
        scene.cameras.main.setBackgroundColor(THEME.menu.sky[0]);

        const container = scene.add.container(0, 0).setDepth(100);
        this.container = container;
        this.buildBackdrop(container, this.result);

        // The stack hangs off a container anchored top-centre, which is what lets a
        // crowded layout be resolved by one `setScale` at the end.
        const content = scene.add.container(this.metrics.cx, this.metrics.top);
        container.add(content);
        this.buildStack(content, this.result, this.actions, this.metrics);

        // The badge is the first piece of the stack, so its centre — in world space, after
        // any centring or scaling — is where the sunburst belongs.
        const badgeRadius = this.metrics.compact ? 22 : 27;
        this.rays?.setPosition(this.metrics.cx, content.y + badgeRadius * content.scaleY);

        this.enter();
    }

    /**
     * Dusk sky, a slow sunburst behind the verdict and a few twinkling specks — the same
     * backdrop the Play Screen opens on, with the rays washed in the outcome colour so a
     * win reads green and a loss red before a single word is read.
     *
     * The gradient is painted as stepped bands on purpose: `fillGradientStyle` is WebGL
     * only and this game renders on Canvas, where it would come out as a flat colour.
     */
    private buildBackdrop(container: Phaser.GameObjects.Container, result: RoundResult): void {
        const scene = this.scene;
        const { width, height } = this.metrics;
        const [skyTop, skyMiddle] = THEME.menu.sky;
        // The verdict washes the lower half of the sky, so win/loss still reads at a
        // glance without the whole screen changing colour the way the light panel did.
        const tint = result.win ? THEME.result.winBg : THEME.result.loseBg;

        const sky = scene.add.graphics();
        const bands = 32;
        const bandHeight = height / bands;
        for (let i = 0; i < bands; i += 1) {
            const t = i / (bands - 1);
            const colour =
                t < 0.5
                    ? mixColor(skyTop, skyMiddle, t * 2)
                    : mixColor(skyMiddle, tint, Math.min(1, (t - 0.5) * 2));
            // One px past the band: adjoining rects otherwise leave hairline seams.
            sky.fillStyle(colour, 1);
            sky.fillRect(0, i * bandHeight, width, bandHeight + 1);
        }
        container.add(sky);

        // Sunburst behind the verdict badge, washing the outcome colour instead of amber.
        // Its position is set later, once the stack has settled, so it stays behind the
        // badge whether or not the stack had to be centred or scaled.
        const reach = Math.hypot(width, height);
        const rays = scene.add.graphics();
        rays.fillStyle(result.win ? THEME.menu.goBottom : THEME.text.dangerNumber, 0.16);
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
        this.rays = rays;
        container.add(rays);
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
            container.add(star);
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

    /** Fills `this.container` with the measured stack. */
    private buildStack(
        content: Phaser.GameObjects.Container,
        result: RoundResult,
        actions: ResultActions,
        m: Metrics,
    ): void {
        const scene = this.scene;
        /** A smaller value on a compact screen, for any kind of value — px or font size. */
        const gap = <T>(regular: T, tight: T): T => (m.compact ? tight : regular);
        let y = 0;

        // Verdict seal: a twelve-point sticker rosette with an extruded ink edge and a
        // chunky cream mark. A plain disc with a hairline tick — what this used to be —
        // reads as a task-app checkbox; the scalloped silhouette reads as a stamp pressed
        // onto the sky, which is the same language as every other chunk on this screen.
        const r = gap(27, 22);
        const badgeY = y + r;
        const badge = scene.add.graphics();

        /** Silhouette of the rosette, centred on `(0, 0)`. Alternating radii make the points. */
        const seal = (cx: number, cyOffset: number, radius: number): void => {
            const points = 12;
            const valley = radius * 0.84;
            badge.beginPath();
            for (let i = 0; i < points * 2; i += 1) {
                const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
                const distance = i % 2 === 0 ? radius : valley;
                const px = cx + Math.cos(angle) * distance;
                const py = cyOffset + Math.sin(angle) * distance;
                if (i === 0) badge.moveTo(px, py);
                else badge.lineTo(px, py);
            }
            badge.closePath();
        };

        const sealColour = result.win ? THEME.menu.goBottom : THEME.text.dangerNumber;
        seal(0, 7, r);
        badge.fillStyle(THEME.menu.ink, 1);
        badge.fillPath();
        seal(0, 0, r);
        badge.fillStyle(sealColour, 1);
        badge.fillPath();
        badge.lineStyle(4, THEME.menu.ink, 1);
        badge.strokePath();

        // Gloss across the top, held to 0.8r so it never spills past the valley radius
        // where the points bite in.
        badge.fillStyle(0xffffff, 0.2);
        badge.beginPath();
        badge.arc(0, 0, r * 0.8, Math.PI * 1.15, Math.PI * 1.85, false);
        badge.closePath();
        badge.fillPath();

        // The mark, in two passes: a wider ink pass then the cream face, which is how the
        // buttons draw their labels — so the verdict is cut from the same stamp as the text.
        const strokes = result.win
            ? [[[-0.44, 0.03], [-0.15, 0.34], [0.47, -0.37]]]
            : [
                  [[-0.34, -0.34], [0.34, 0.34]],
                  [[-0.34, 0.34], [0.34, -0.34]],
              ];
        const markWidth = r * 0.24;
        const drawMark = (width: number, colour: number): void => {
            badge.fillStyle(colour, 1);
            badge.lineStyle(width, colour, 1);
            for (const polyline of strokes) {
                for (let i = 0; i < polyline.length - 1; i += 1) {
                    badge.beginPath();
                    badge.moveTo(polyline[i][0] * r, polyline[i][1] * r);
                    badge.lineTo(polyline[i + 1][0] * r, polyline[i + 1][1] * r);
                    badge.strokePath();
                }
                // Graphics strokes butt-end, so the joints and terminals are capped by
                // hand — otherwise the tick's elbow shears and the arms look cut off.
                for (const [px, py] of polyline) badge.fillCircle(px * r, py * r, width / 2);
            }
        };
        drawMark(markWidth + Math.max(4, r * 0.16), THEME.menu.ink);
        drawMark(markWidth, THEME.menu.logoInkNumber);

        // Held in a container so the tilt pivots on the seal's own centre — rotating the
        // graphics directly would swing it around its bounding-box corner and throw it off
        // the sunburst behind it. It leans further than the plates below do (-1.6): those
        // are set down straight, this is stamped on askew.
        const badgeHolder = scene.add.container(0, badgeY).setAngle(-5);
        badgeHolder.add(badge);
        content.add(badgeHolder);
        y = badgeY + r + gap(14, 10);

        // Headline, stroked and drop-shadowed like the logo, stepping down until it fits
        // the screen: "OUT OF FENDERS" is the long one and would otherwise run off both
        // edges of a narrow phone.
        const headlineSize = gap(40, 31);
        const headline = addText(scene, 0, 0, result.win ? 'LOT CLEARED' : 'OUT OF FENDERS', {
            fontSize: `${headlineSize}px`,
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 8,
            letterSpacing: 2,
            shadow: { x: 0, y: 5, color: THEME.menu.shadowCss },
        }).setOrigin(0.5, 0.5);
        let headlineFontSize = headlineSize;
        while (headline.width > m.maxWidth && headlineFontSize > 20) {
            headlineFontSize -= 2;
            headline.setFontSize(headlineFontSize);
        }
        headline.setY(y + headline.height / 2);
        content.add(headline);
        y += headline.height + gap(10, 8);

        // Level, on the same tilted amber plate the logo's second line sits on.
        const levelLabel = addText(scene, 0, 0, `LEVEL ${result.level}`, {
            fontSize: gap('15px', '13px'),
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 3,
            letterSpacing: 1,
        }).setOrigin(0.5, 0.5);
        const plateWidth = levelLabel.width + 40;
        const plateHeight = levelLabel.height + 14;
        const plate = scene.add.container(0, y + plateHeight / 2).setAngle(-1.6);
        const plateGraphics = scene.add.graphics();
        plateGraphics.fillStyle(THEME.menu.ink, 1);
        plateGraphics.fillRoundedRect(-plateWidth / 2, -plateHeight / 2 + 6, plateWidth, plateHeight, 14);
        paintRoundedBox(plateGraphics, -plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 14, THEME.menu.plate, THEME.menu.ink, 1, 4);
        plateGraphics.fillStyle(0xffffff, 0.24);
        plateGraphics.fillRoundedRect(-plateWidth / 2 + 6, -plateHeight / 2 + 4, plateWidth - 12, plateHeight * 0.36, { tl: 10, tr: 10, br: 4, bl: 4 });
        plate.add(plateGraphics);
        plate.add(levelLabel);
        content.add(plate);
        y += plateHeight + gap(26, 18);

        // Score sticker card: caption tab, big accent number, a hairline, then the stats.
        y += this.buildScoreCard(content, result, m, y);

        // Buttons: chunky extruded slabs, the same construction as the HUD's pause and the
        // Play Screen's MULAI, so the panel closes on the screen it opened with.
        const primaryHeight = gap(66, 56);
        content.add(
            createArcadeButton(scene, {
                x: 0,
                y: y + primaryHeight / 2,
                width: Math.min(300, m.width - 48),
                height: primaryHeight,
                label: result.win ? 'NEXT LEVEL' : 'RETRY',
                topColour: result.win ? THEME.menu.goTop : THEME.menu.plate,
                // The danger orange, shared with the HUD's fenders chip so the two agree
                // on what a loss looks like.
                bodyColour: result.win ? THEME.menu.goBottom : THEME.button.danger.fill,
                labelColour: THEME.menu.logoInk,
                fontSize: gap(28, 24),
                onTap: () => (result.win ? actions.onNextLevel() : actions.onRetry()),
                loops: this.loops,
            }),
        );
        y += primaryHeight + gap(14, 10);

        const exitHeight = gap(54, 46);
        content.add(
            createArcadeButton(scene, {
                x: 0,
                y: y + exitHeight / 2,
                width: Math.min(300, m.width - 48),
                height: exitHeight,
                label: 'EXIT',
                topColour: 0xffffff,
                bodyColour: THEME.menu.card,
                labelColour: THEME.menu.cardInkCss,
                // A dark label on a pale slab carries its own contrast, so no outline.
                strokeColour: '',
                fontSize: gap(22, 19),
                onTap: () => actions.onExit(),
                loops: this.loops,
            }),
        );
        y += exitHeight;

        // The stack only scales when it genuinely does not fit, and never past legibility.
        // When it does fit, the leftover space is split above and below rather than all
        // pooling at the bottom, so the panel reads as centred instead of stuck to the
        // top. `available` has already held back the cutout and the bottom margin, so
        // centring inside it cannot push anything into either.
        const bottomMargin = Math.max(12, m.height * 0.03);
        const available = m.height - m.top - bottomMargin;
        if (y > available) {
            content.setScale(Math.max(0.68, available / y));
        } else {
            content.y += (available - y) / 2;
        }
    }

    /**
     * The score card, as a tilted cream sticker with a caption tab. Returns its height so
     * the buttons can hang off it. Everything inside is measured before the card is drawn,
     * so a narrow screen grows the card rather than clipping a wrapped stat line.
     */
    private buildScoreCard(
        content: Phaser.GameObjects.Container,
        result: RoundResult,
        m: Metrics,
        top: number,
    ): number {
        const scene = this.scene;
        const wrapWidth = m.cardWidth - 44;

        const scoreSize = m.compact ? 44 : 52;
        const score = addText(scene, 0, 0, String(result.score), {
            fontSize: `${scoreSize}px`,
            fontStyle: 'bold',
            color: THEME.text.accent,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        let scoreFontSize = scoreSize;
        while (score.width > wrapWidth && scoreFontSize > 26) {
            scoreFontSize -= 2;
            score.setFontSize(scoreFontSize);
        }

        const statLines = [
            `${result.cleared} of ${result.totalCars} cars cleared`,
            `best combo x${result.maxCombo}`,
        ];
        const stats = statLines.map((line) =>
            addText(scene, 0, 0, line, {
                fontSize: m.compact ? '13px' : '14px',
                color: THEME.menu.cardInkCss,
                align: 'center',
                wordWrapWidth: wrapWidth,
            }).setOrigin(0.5, 0.5),
        );

        // Measured, then drawn: caption room on top, the number, a hairline, the stats.
        const padTop = 26;
        const padBottom = 16;
        const gapNumber = 10;
        const gapStats = 12;
        const statsHeight = stats.reduce((sum, line) => sum + line.height, 0) + 4 * (stats.length - 1);
        const cardHeight =
            padTop + score.height + gapNumber + 1 + gapStats + statsHeight + padBottom;
        const cardWidth = m.cardWidth;

        const card = scene.add.container(0, top + cardHeight / 2).setAngle(-1.3);
        content.add(card);

        const cardGraphics = scene.add.graphics();
        cardGraphics.fillStyle(THEME.menu.ink, 1);
        cardGraphics.fillRoundedRect(-cardWidth / 2 + 7, -cardHeight / 2 + 9, cardWidth, cardHeight, 20);
        paintRoundedBox(cardGraphics, -cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 20, THEME.menu.card, THEME.menu.ink, 1, 4);
        cardGraphics.fillStyle(0xffffff, 0.5);
        cardGraphics.fillRoundedRect(-cardWidth / 2 + 6, -cardHeight / 2 + 5, cardWidth - 12, cardHeight * 0.22, { tl: 14, tr: 14, br: 4, bl: 4 });
        card.add(cardGraphics);

        // Caption tab, straddling the card's top edge the way the how-to tab does.
        const tabLabel = addText(scene, 0, 0, 'SCORE', {
            fontSize: '12px',
            fontStyle: 'bold',
            color: THEME.menu.logoInk,
            align: 'center',
            stroke: THEME.menu.inkCss,
            strokeThickness: 3,
            letterSpacing: 1,
        }).setOrigin(0.5, 0.5);
        const tabWidth = tabLabel.width + 26;
        const tabX = -cardWidth / 2 + 20;
        const tabY = -cardHeight / 2 - 13;
        const tabGraphics = scene.add.graphics();
        tabGraphics.fillStyle(THEME.menu.ink, 1);
        tabGraphics.fillRoundedRect(tabX + 4, tabY + 5, tabWidth, 28, 9);
        paintRoundedBox(tabGraphics, tabX, tabY, tabWidth, 28, 9, THEME.menu.badge[0], THEME.menu.ink, 1, 3);
        card.add(tabGraphics);
        tabLabel.setPosition(tabX + tabWidth / 2, tabY + 14);
        card.add(tabLabel);

        let cursor = -cardHeight / 2 + padTop;
        score.setY(cursor + score.height / 2);
        card.add(score);
        cursor += score.height + gapNumber;

        const divider = scene.add.graphics();
        divider.lineStyle(2, THEME.menu.ink, 0.18);
        divider.lineBetween(-cardWidth / 2 + 22, cursor, cardWidth / 2 - 22, cursor);
        card.add(divider);
        cursor += 1 + gapStats;

        stats.forEach((line) => {
            line.setY(cursor + line.height / 2);
            card.add(line);
            cursor += line.height + 4;
        });

        return cardHeight;
    }

    /**
     * Drops the panel in over the colour it is fading onto.
     *
     * It waits out the tail of the scene's fade-in first, so the win/loss colour is
     * already settled when the panel arrives rather than the two fighting for the same
     * third of a second. The whole container moves as one — the backdrop, the readout and
     * both buttons — so the hit areas ride along with what the player can see.
     */
    private enter(): void {
        const container = this.container;
        if (!container) return;
        container.setAlpha(0);
        container.y = 26;
        this.scene.tweens.add({
            targets: container,
            alpha: 1,
            y: 0,
            duration: 240,
            delay: 90,
            ease: 'Back.easeOut',
        });
    }

    dispose(): void {
        this.teardown();
    }

    /**
     * Stops the idle loops first: a tween left running would drive a destroyed object.
     * A rebuild goes through the same path, so a resize cannot orphan the old panel's
     * sunburst or button bobs either.
     */
    private teardown(): void {
        for (const loop of this.loops) loop.stop();
        this.loops.length = 0;
        this.rays = null;
        if (!this.container) return;
        this.scene.tweens.killTweensOf(this.container);
        this.container.destroy(true);
        this.container = null;
    }
}
