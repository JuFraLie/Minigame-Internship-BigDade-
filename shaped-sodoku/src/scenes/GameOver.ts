import Phaser from 'phaser';

import type { AppDeps } from '../app/deps.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../app/viewport.ts';
import { formatScore } from '../domain/Scoring.ts';
import { drawBevel, drawRibbon } from '../render/Chunky.ts';
import { ensureTextures, shapeTextureKey } from '../render/ShapeTextures.ts';
import { DISPLAY_STACK, PALETTE } from '../render/palette.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';
import { type Arrivable, addLabel, createButton, fitLabel } from './widgets.ts';

/**
 * The Result Panel — the only screen in the game allowed to restart or leave.
 *
 * Everything it needs has already been recorded: the round reported `endRound` and stashed
 * its score on the session just before this scene appeared. Retry replays the *same*
 * puzzle, because the session keeps the level's seed untouched; Next Level advances the
 * level, which draws a fresh one. Exit calls the bridge once and does nothing else —
 * no navigation, no restart, because teardown belongs to the host app.
 *
 * The layout is a flow, not a set of percentages: the buttons hang off the panel floor and
 * everything above them flows down toward that fixed point, so the panel stays readable on
 * a short phone and on a tall one without two sets of numbers to keep in step.
 */
export class GameOver extends Phaser.Scene {
    readonly #deps: AppDeps;
    #acting = false;
    /** Closed by the scene's own shutdown, so no tween can write to a destroyed label. */
    #alive = true;

    readonly #onViewportChanged = (): void => this.#relayout();

    constructor(deps: AppDeps) {
        super({ key: SCENE_RESULT });
        this.#deps = deps;
    }

    create(): void {
        this.#acting = false;
        this.#alive = true;
        applyRenderScale(this);
        ensureTextures(this);

        const { width, height } = this.#deps.viewport.current();
        const { lastWin: win, lastScore: score, level } = this.#deps.session;
        const cx = width / 2;

        this.add.image(0, 0, 'background-wash').setOrigin(0).setDisplaySize(width, height).setDepth(-3);

        // The round you just finished steps back behind a dim, which is what makes the
        // panel read as a new layer rather than as more of the same screen.
        const scrim = this.add.graphics().setDepth(-2);
        scrim.fillStyle(PALETTE.drop, 0.55);
        scrim.fillRect(0, 0, width, height);

        const panelWidth = Math.round(width * 0.86);
        const panelHeight = Math.round(height * 0.62);
        const panelTop = Math.round((height - panelHeight) / 2);
        const panelLeft = Math.round(cx - panelWidth / 2);

        // ---- the floor: buttons are anchored before anything above them is measured ----
        const primaryH = Math.max(46, Math.round(height * 0.066));
        const exitH = Math.max(34, Math.round(primaryH * 0.76));
        const floorPad = Math.max(12, Math.round(panelHeight * 0.04));
        const buttonGap = Math.max(12, Math.round(panelHeight * 0.045));
        const exitCy = panelTop + panelHeight - floorPad - exitH / 2;
        const primaryCy = exitCy - exitH / 2 - buttonGap - primaryH / 2;

        const panel = this.add.graphics().setDepth(-1);
        drawBevel(panel, panelLeft, panelTop, panelWidth, panelHeight, 26, {
            fill: PALETTE.panel,
            depth: 7,
            drop: 14,
            outline: win ? PALETTE.ribbon : PALETTE.ribbonLoss,
            outlineWidth: 4,
            gloss: 0.08,
        });

        // ---- the flow: icon, verdict ribbon, level chip, caption, score ----
        const naturalGap = Math.max(6, Math.round(panelHeight * 0.034));
        const ribbonH = Math.max(30, Math.round(panelHeight * 0.135));
        const ribbonW = Math.round(panelWidth * 0.97);
        const levelFont = Math.max(13, Math.round(width * 0.04));
        const captionFont = Math.max(11, Math.round(width * 0.033));
        const scoreFont = Math.round(Math.min(width * 0.115, panelHeight * 0.15));
        const scoreStroke = Math.max(3, Math.round(scoreFont * 0.12));

        // Phaser reports a single-line Text's height as exactly `fontSize + strokeThickness`,
        // so the whole flow can be reserved before any label exists — which is what lets the
        // gaps shrink to fit instead of the content colliding with the buttons.
        const levelH = levelFont;
        const captionH = captionFont;
        const scoreH = scoreFont + scoreStroke;

        const stackTop = panelTop + Math.max(12, Math.round(panelHeight * 0.05));
        const stackBottom = primaryCy - primaryH / 2 - Math.max(10, Math.round(panelHeight * 0.035));
        const available = Math.max(1, stackBottom - stackTop);

        const minGap = Math.max(3, Math.round(naturalGap * 0.3));
        const fixed = ribbonH + levelH + captionH + scoreH;
        const wantedIcon = Math.round(Math.min(width * 0.17, panelHeight * 0.2));
        const iconSize = Math.max(
            Math.round(panelHeight * 0.1),
            Math.min(wantedIcon, available - fixed - 4 * minGap),
        );

        // The chip and the score caption are small labels; crowding them against their
        // neighbours is what makes a stacked panel look cheap.
        const gaps = [naturalGap * 0.95, naturalGap * 1.4, naturalGap * 1.05, naturalGap * 0.75];
        const gapTotal = gaps.reduce((sum, gap) => sum + gap, 0);
        const slack = Math.max(0, available - (iconSize + fixed));
        const gapScale = gapTotal > 0 ? Math.max(4 * minGap, Math.min(gapTotal, slack)) / gapTotal : 0;
        const [gapAfterIcon, gapAfterRibbon, gapAfterLevel, gapAfterCaption] = gaps.map((gap) => gap * gapScale);

        let cursor = stackTop;
        const iconCy = cursor + iconSize / 2;
        cursor += iconSize + gapAfterIcon;
        const ribbonCy = cursor + ribbonH / 2;
        cursor += ribbonH + gapAfterRibbon;
        const levelCy = cursor + levelH / 2;
        cursor += levelH + gapAfterLevel;
        const captionCy = cursor + captionH / 2;
        cursor += captionH + gapAfterCaption;
        const scoreCy = cursor + scoreH / 2;

        const icon = this.add
            .image(cx, iconCy, shapeTextureKey(win ? 3 : 5, win ? 'normal' : 'surprised'))
            .setDisplaySize(iconSize, iconSize)
            .setDepth(1);

        const ribbon = this.add.graphics().setDepth(1);
        drawRibbon(ribbon, cx - ribbonW / 2, ribbonCy - ribbonH / 2, ribbonW, ribbonH, {
            fill: win ? PALETTE.ribbon : PALETTE.ribbonLoss,
            depth: 5,
            drop: 7,
            outline: PALETTE.ink,
            outlineWidth: 3,
        });

        const verdict = fitLabel(
            this,
            cx,
            ribbonCy,
            win ? 'YOU WIN!' : 'OUT OF HEARTS',
            {
                fontFamily: DISPLAY_STACK,
                fontSize: `${Math.round(ribbonH * 0.5)}px`,
                fontStyle: 'bold',
                color: '#ffffff',
                stroke: '#15183c',
                strokeThickness: Math.max(3, Math.round(ribbonH * 0.08)),
                shadow: { offsetX: 0, offsetY: 2, color: '#0b0e28', blur: 0, fill: true, stroke: true },
            },
            ribbonW * 0.78,
        ).setDepth(2);

        const levelLabel = addLabel(this, cx, levelCy, `LEVEL ${level}`, {
            fontFamily: DISPLAY_STACK,
            fontSize: `${levelFont}px`,
            fontStyle: 'bold',
            color: '#ffffff',
        }).setDepth(2);

        const chipW = levelLabel.width + levelH * 1.7;
        const chipH = levelH + 9;
        const chip = this.add.graphics().setDepth(1);
        drawBevel(chip, cx - chipW / 2, levelCy - chipH / 2, chipW, chipH, chipH / 2, {
            fill: PALETTE.hudPill,
            depth: 3,
            outline: PALETTE.gold,
            outlineWidth: 2,
            gloss: 0.16,
        });

        const caption = addLabel(this, cx, captionCy, 'SCORE', {
            fontSize: `${captionFont}px`,
            fontStyle: 'bold',
            color: '#b9b3d8',
        }).setDepth(2);

        const scoreLabel = addLabel(this, cx, scoreCy, formatScore(score), {
            fontFamily: DISPLAY_STACK,
            fontSize: `${scoreFont}px`,
            fontStyle: 'bold',
            color: '#ffd76a',
            stroke: '#15183c',
            strokeThickness: scoreStroke,
            shadow: {
                offsetX: 0,
                offsetY: Math.max(2, Math.round(scoreFont * 0.08)),
                color: '#0b0e28',
                blur: 0,
                fill: true,
                stroke: true,
            },
        }).setDepth(2);

        // ---- the buttons ----
        const buttonWidth = Math.round(panelWidth * 0.74);
        createButton(this, {
            x: cx,
            y: primaryCy,
            width: buttonWidth,
            height: primaryH,
            label: win ? 'NEXT LEVEL' : 'RETRY',
            fill: win ? PALETTE.button : PALETTE.buttonAlt,
            labelColour: '#ffffff',
            fontSize: Math.round(primaryH * 0.4),
            onPress: () => (win ? this.#nextLevel() : this.#retry()),
            enterDelay: 380,
        });

        createButton(this, {
            x: cx,
            y: exitCy,
            width: Math.round(buttonWidth * 0.7),
            height: exitH,
            label: 'EXIT',
            fill: PALETTE.hudPill,
            labelColour: '#cfc9f5',
            fontSize: Math.round(exitH * 0.42),
            onPress: () => this.#exit(),
            enterDelay: 470,
        });

        // ---- arrival, then the count-up ----
        scrim.setAlpha(0);
        this.tweens.add({ targets: scrim, alpha: 1, duration: 320, ease: 'Sine.easeOut' });

        const staged: Arrivable[] = [panel, ribbon, chip, icon, verdict, levelLabel, caption, scoreLabel];
        staged.forEach((target, index) => {
            const homeY = target.y;
            target.setAlpha(0);
            target.y = homeY + 26;
            const delay = 70 + index * 50;
            // Alpha and travel split again: `Back` overshoots past 1, and an over-large
            // globalAlpha is dropped outright by canvas rather than clamped.
            this.tweens.add({ targets: target, alpha: 1, duration: 300, delay, ease: 'Sine.easeOut' });
            this.tweens.add({ targets: target, y: homeY, duration: 540, delay, ease: 'Back.easeOut' });
        });

        this.tweens.add({
            targets: icon,
            angle: win ? 6 : -6,
            duration: 1100,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.#countUp(scoreLabel, score);

        // `game.events` outlives the scene, so it must be unbound on shutdown — otherwise a
        // stopped Result Panel would keep restarting itself, and could even come back.
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.#alive = false;
            this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
        });
    }

    /**
     * Rolls the score figure up to its final value, which is the one flourish a result
     * screen gets for free and the one players wait for.
     */
    #countUp(label: Phaser.GameObjects.Text, final: number): void {
        if (final <= 0) return;

        const counter = { value: 0 };
        label.setText('0');
        this.tweens.add({
            targets: counter,
            value: final,
            duration: 900,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                if (this.#alive) label.setText(formatScore(Math.round(counter.value)));
            },
            onComplete: () => {
                if (this.#alive) label.setText(formatScore(final));
            },
        });
    }

    /**
     * The panel is drawn entirely from the live viewport inside `create()`, so a viewport
     * change is handled by drawing it again. Phaser queues a restart rather than running
     * it inline, which is what makes this safe to call from the resize handler.
     *
     * Restarting resets `#acting`, and that is correct: the result being shown has not
     * changed, so the buttons must become usable again rather than stay latched. The guard
     * exists so a resize can never cancel a Retry, Next Level or Exit already commanded.
     */
    #relayout(): void {
        if (this.#acting || !this.scene.isActive()) return;
        this.scene.restart();
    }

    /** Same level, same seed — an honest second attempt at the same puzzle. */
    #retry(): void {
        if (this.#acting) return;
        this.#acting = true;
        this.scene.start(SCENE_GAME);
    }

    /** Advances the level first, so the new round generates from a fresh seed. */
    #nextLevel(): void {
        if (this.#acting) return;
        this.#acting = true;
        this.#deps.session.advanceLevel();
        this.scene.start(SCENE_GAME);
    }

    /** Bridge exit, exactly once, and nothing else. */
    #exit(): void {
        if (this.#acting) return;
        this.#acting = true;
        this.#deps.bridge.exit(this.#deps.session.lastWin, this.#deps.session.lastScore);
    }
}
