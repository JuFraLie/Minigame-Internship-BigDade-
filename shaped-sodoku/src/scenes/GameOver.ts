import Phaser from 'phaser';

import type { AppDeps } from '../app/deps.ts';
import { applyRenderScale, VIEWPORT_CHANGED } from '../app/viewport.ts';
import { formatScore } from '../domain/Scoring.ts';
import { ensureTextures, shapeTextureKey } from '../render/ShapeTextures.ts';
import { PALETTE } from '../render/palette.ts';
import { SCENE_GAME, SCENE_RESULT } from './keys.ts';
import { addLabel, createButton } from './widgets.ts';

/**
 * The Result Panel — the only screen in the game allowed to restart or leave.
 *
 * Everything it needs has already been recorded: the round reported `endRound` and stashed
 * its score on the session just before this scene appeared. Retry replays the *same*
 * puzzle, because the session keeps the level's seed untouched; Next Level advances the
 * level, which draws a fresh one. Exit calls the bridge once and does nothing else —
 * no navigation, no restart, because teardown belongs to the host app.
 */
export class GameOver extends Phaser.Scene {
    readonly #deps: AppDeps;
    #acting = false;

    readonly #onViewportChanged = (): void => this.#relayout();

    constructor(deps: AppDeps) {
        super({ key: SCENE_RESULT });
        this.#deps = deps;
    }

    create(): void {
        this.#acting = false;
        applyRenderScale(this);
        ensureTextures(this);

        const viewport = this.#deps.viewport.current();
        const { width, height } = viewport;
        const { lastWin: win, lastScore: score, level } = this.#deps.session;

        this.add.image(0, 0, 'background-wash').setOrigin(0).setDisplaySize(width, height);

        const panelWidth = width * 0.84;
        const panelHeight = height * 0.56;
        const panelTop = (height - panelHeight) / 2;

        const panel = this.add.graphics();
        panel.fillStyle(PALETTE.panel, 0.96);
        panel.fillRoundedRect(width / 2 - panelWidth / 2, panelTop, panelWidth, panelHeight, 22);
        panel.lineStyle(4, win ? PALETTE.button : PALETTE.danger, 0.85);
        panel.strokeRoundedRect(width / 2 - panelWidth / 2, panelTop, panelWidth, panelHeight, 22);

        // Vertical rhythm inside the panel: icon, verdict, level, score caption, score, then
        // the two buttons. The fractions are spaced so the big score figure keeps air both
        // above and below it instead of sitting on top of the primary button.
        const iconSize = width * 0.16;
        this.add
            .image(width / 2, panelTop + panelHeight * 0.145, shapeTextureKey(win ? 3 : 5, win ? 'normal' : 'surprised'))
            .setDisplaySize(iconSize, iconSize);

        addLabel(this, width / 2, panelTop + panelHeight * 0.305, win ? 'You Win!' : 'Out of Hearts', {
            fontSize: `${Math.round(width * 0.085)}px`,
            fontStyle: 'bold',
            color: win ? '#74d9c6' : '#ff8fa0',
        });

        addLabel(this, width / 2, panelTop + panelHeight * 0.425, `Level ${level}`, {
            fontSize: `${Math.round(width * 0.038)}px`,
            color: '#b9b3d8',
        });

        addLabel(this, width / 2, panelTop + panelHeight * 0.525, 'Score', {
            fontSize: `${Math.round(width * 0.034)}px`,
            color: '#b9b3d8',
        });
        addLabel(this, width / 2, panelTop + panelHeight * 0.645, formatScore(score), {
            fontSize: `${Math.round(width * 0.1)}px`,
            fontStyle: 'bold',
            color: '#fdf4e6',
        });

        const buttonWidth = panelWidth * 0.72;
        const buttonHeight = Math.max(48, height * 0.065);
        const fontSize = Math.round(buttonHeight * 0.42);

        // Win offers Next Level; a loss offers Retry, straight back into gameplay.
        createButton(this, {
            x: width / 2,
            y: panelTop + panelHeight * 0.795,
            width: buttonWidth,
            height: buttonHeight,
            label: win ? 'NEXT LEVEL' : 'RETRY',
            fill: win ? PALETTE.button : PALETTE.buttonAlt,
            labelColour: '#1c2148',
            fontSize,
            onPress: () => (win ? this.#nextLevel() : this.#retry()),
        });

        createButton(this, {
            x: width / 2,
            y: panelTop + panelHeight * 0.925,
            width: buttonWidth * 0.72,
            height: buttonHeight * 0.8,
            label: 'EXIT',
            fill: PALETTE.boardFrame,
            labelColour: '#d8d4ee',
            fontSize: Math.round(buttonHeight * 0.34),
            onPress: () => this.#exit(),
        });

        // `game.events` outlives the scene, so it must be unbound on shutdown — otherwise a
        // stopped Result Panel would keep restarting itself, and could even come back.
        this.game.events.on(VIEWPORT_CHANGED, this.#onViewportChanged);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(VIEWPORT_CHANGED, this.#onViewportChanged);
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
