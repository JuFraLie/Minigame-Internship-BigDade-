import Phaser from 'phaser';

import { sellRefund, upgradeCost } from '../../domain/economy.ts';
import { PAD_HALF, type GameMap } from '../../domain/maps.ts';
import {
    TOWER_SPECS,
    TOWER_TYPES,
    WAVES_PER_LEVEL,
    type EnemyType,
    type RoundEvent,
    type RoundSnapshot,
    type TowerType,
} from '../../domain/types.ts';
import type { Selection } from './inputAdapter.ts';
import type { PlayLayout } from './layout.ts';
import type { GameViewPort, PlayUiState } from './playView.ts';
import {
    BOARD_KEY,
    COLORS,
    NOMINAL_TILE,
    PAD_KEY,
    ensureEntityTextures,
    ensureTextures,
    pixelBox,
    renderBoardTexture,
    type PixelVariant,
} from './textures.ts';
import { fitFontSize, setUiFontSize, uiText } from './uiStyle.ts';
import { createViewTransform, type ViewTransform } from './viewTransform.ts';

/**
 * The Canvas renderer: everything Phaser draws for the play screen.
 *
 * Procedural textures are generated once (textures.ts), the board once per layout, and
 * the per-frame work is a pass over pooled sprites plus two small `Graphics` — no
 * allocation in the frame path, text updated only when its value changes, and a pixel
 * ratio capped at 2 by the composition root. Events become flourishes (banner, gate
 * flash); the entity positions come from the snapshot, interpolated with `alpha` so a
 * slow frame never changes what the player sees.
 */

/** Pooled enemy sprites; a wave beyond this simply stops drawing the excess. */
const ENEMY_POOL = 96;
const TOWER_POOL = 12;
const SHOT_POOL = 160;

const BANNER_MS = 1400;
const FLASH_MS = 240;

interface Capsule {
    readonly image: Phaser.GameObjects.Image;
    readonly label: Phaser.GameObjects.Text;
    cached: string;
}

function formatScore(score: number): string {
    if (score < 10_000) return String(score);
    if (score < 1_000_000) return `${Math.floor(score / 1000)}k`;
    return `${Math.floor(score / 1_000_000)}M`;
}

function formatGold(gold: number): string {
    if (gold < 10_000) return String(gold);
    return `${Math.floor(gold / 1000)}k`;
}

export class PhaserCanvasRenderer implements GameViewPort {
    readonly #scene: Phaser.Scene;
    #layout: PlayLayout | null = null;
    #map: GameMap | null = null;
    #transform: ViewTransform | null = null;
    #entityScale = 1;

    readonly #objects: Phaser.GameObjects.GameObject[] = [];

    #board: Phaser.GameObjects.Image | null = null;
    #under: Phaser.GameObjects.Graphics | null = null;
    #over: Phaser.GameObjects.Graphics | null = null;
    /** Per-spot flag: a tower stands there, so its pad is not drawn. Reused every frame. */
    #padTaken: boolean[] = [];
    /** One silver-pavement image per build spot; visibility flips per frame. */
    #padImages: Phaser.GameObjects.Image[] = [];

    #enemySprites: Phaser.GameObjects.Sprite[] = [];
    #towerSprites: Phaser.GameObjects.Image[] = [];
    #shotSprites: Phaser.GameObjects.Image[] = [];
    /** Whether the walk cycles are held mid-stride behind the pause overlay. */
    #animPaused = false;

    #level!: Capsule;
    #wave!: Capsule;
    #lives!: Capsule;
    #gold!: Capsule;
    #score!: Capsule;
    #pause!: Capsule;

    #callWaveImage!: Phaser.GameObjects.Image;
    #callWaveLabel!: Phaser.GameObjects.Text;
    #callWaveCached = '';

    #menuPanel!: Phaser.GameObjects.Image;
    #menuTitle!: Phaser.GameObjects.Text;
    #buildImages: Phaser.GameObjects.Image[] = [];
    #buildLabels: Phaser.GameObjects.Text[] = [];
    #buildCosts: Phaser.GameObjects.Text[] = [];
    #buildCached: string[] = [];
    #buildCostCached: string[] = [];
    #towerImages: Phaser.GameObjects.Image[] = [];
    #towerLabels: Phaser.GameObjects.Text[] = [];
    #towerCached: string[] = [];

    #dim!: Phaser.GameObjects.Image;
    #resumeImage!: Phaser.GameObjects.Image;
    #resumeLabel!: Phaser.GameObjects.Text;

    #banner!: Phaser.GameObjects.Text;
    #bannerUntil = 0;
    #flash!: Phaser.GameObjects.Image;
    #flashUntil = 0;

    constructor(scene: Phaser.Scene) {
        this.#scene = scene;
    }

    // -- lifecycle --------------------------------------------------------

    create(layout: PlayLayout, map: GameMap): void {
        this.#layout = layout;
        this.#map = map;
        this.#transform = createViewTransform(layout.board);
        this.#entityScale = layout.board.tile / NOMINAL_TILE;

        const scene = this.#scene;
        ensureTextures(scene);
        ensureEntityTextures(scene);
        renderBoardTexture(scene, map, layout.board.tile);

        this.#board = this.#add(scene.add.image(layout.board.x, layout.board.y, BOARD_KEY).setOrigin(0, 0).setDepth(1));
        this.#under = this.#add(scene.add.graphics().setDepth(4));
        this.#over = this.#add(scene.add.graphics().setDepth(13));

        // Pads live under the selection Graphics (depth 3 vs 4), so the gold outline
        // and the range circle always draw over the slab, and towers (6) stand on it.
        this.#padImages = [];
        for (let i = 0; i < layout.spots.length; i++) {
            this.#padImages.push(this.#add(scene.add.image(0, 0, PAD_KEY).setVisible(false).setDepth(3)));
        }

        this.#enemySprites = [];
        for (let i = 0; i < ENEMY_POOL; i++) {
            this.#enemySprites.push(this.#add(scene.add.sprite(0, 0, 'enemy-grunt-0').setVisible(false).setDepth(8).setScale(this.#entityScale)));
        }
        this.#towerSprites = [];
        for (let i = 0; i < TOWER_POOL; i++) {
            this.#towerSprites.push(
                // Bottom-anchored: a tall tower stands on its pad and grows upward.
                this.#add(scene.add.image(0, 0, 'tower-dart-1').setVisible(false).setDepth(6).setOrigin(0.5, 1).setScale(this.#entityScale)),
            );
        }
        this.#shotSprites = [];
        for (let i = 0; i < SHOT_POOL; i++) {
            this.#shotSprites.push(this.#add(scene.add.image(0, 0, 'shot-dart').setVisible(false).setDepth(10).setScale(this.#entityScale)));
        }

        this.#level = this.#capsule(layout.hud.level, 'LV 1');
        this.#wave = this.#capsule(layout.hud.wave, 'W 1/3');
        this.#lives = this.#capsule(layout.hud.lives, 'HP 10');
        this.#gold = this.#capsule(layout.hud.gold, 'G 100');
        this.#score = this.#capsule(layout.hud.score, '0');
        this.#pause = this.#capsule(layout.hud.pause, 'II');

        this.#callWaveImage = this.#button(layout.callWave, 'primary');
        this.#callWaveLabel = this.#label(layout.callWave, 'CALL WAVE', 12, COLORS.ink);
        this.#callWaveCached = '';

        this.#menuPanel = this.#add(
            scene.add
                .image(
                    Math.round(layout.menu.panel.x),
                    Math.round(layout.menu.panel.y),
                    pixelBox(scene, layout.menu.panel.width, layout.menu.panel.height, 'panel'),
                )
                .setOrigin(0, 0)
                .setDepth(20)
                .setVisible(false),
        );
        this.#menuTitle = this.#text(
            layout.menu.panel.x + layout.menu.panel.width / 2,
            layout.menu.panel.y + 18,
            10,
            COLORS.goldBright,
        ).setVisible(false);

        this.#buildImages = [];
        this.#buildLabels = [];
        this.#buildCosts = [];
        this.#buildCached = [];
        this.#buildCostCached = [];
        const buildColor: Record<TowerType, number> = { dart: COLORS.dart, cannon: COLORS.cannon, frost: COLORS.frost };
        layout.menu.buildButtons.forEach((rect, index) => {
            this.#buildImages.push(this.#button(rect, 'button').setVisible(false));
            const type = TOWER_TYPES[index];
            this.#buildLabels.push(
                this.#label(
                    { ...rect, y: rect.y + rect.height * 0.3 },
                    '',
                    fitFontSize(rect.width - 8, 8, 11, 8),
                    type ? buildColor[type] : COLORS.text,
                ).setVisible(false),
            );
            this.#buildCosts.push(
                this.#label(
                    { ...rect, y: rect.y + rect.height * 0.7 },
                    '',
                    fitFontSize(rect.width - 8, 5, 9, 7),
                    COLORS.textDim,
                ).setVisible(false),
            );
            this.#buildCached.push('');
            this.#buildCostCached.push('');
        });

        this.#towerImages = [];
        this.#towerLabels = [];
        this.#towerCached = [];
        for (const rect of layout.menu.towerButtons) {
            this.#towerImages.push(this.#button(rect, 'button').setVisible(false));
            this.#towerLabels.push(
                this.#label(rect, '', fitFontSize(rect.width - 10, 13, 11, 7)).setVisible(false),
            );
            this.#towerCached.push('');
        }

        this.#dim = this.#add(
            scene.add.image(0, 0, 'ui-ink').setOrigin(0, 0).setDepth(40).setAlpha(0.62).setVisible(false).setDisplaySize(layout.width, layout.height),
        );
        this.#resumeImage = this.#button(layout.resume, 'primary', 41).setVisible(false);
        this.#resumeLabel = this.#label(
            layout.resume,
            'RESUME',
            fitFontSize(layout.resume.width - 24, 6, 14, 9),
            COLORS.ink,
            42,
        ).setVisible(false);

        this.#banner = this.#text(layout.width / 2, layout.height * 0.4, 14, COLORS.goldBright, true).setVisible(false).setDepth(50);
        this.#flash = this.#add(
            scene.add.image(0, 0, 'ui-white').setOrigin(0, 0).setDepth(60).setAlpha(0).setVisible(false).setDisplaySize(layout.width, layout.height),
        );

        this.#layoutChrome(layout);
    }

    relayout(layout: PlayLayout): void {
        const map = this.#map;
        if (!map) return;

        this.#layout = layout;
        this.#transform = createViewTransform(layout.board);
        this.#entityScale = layout.board.tile / NOMINAL_TILE;

        renderBoardTexture(this.#scene, map, layout.board.tile);
        this.#board?.setPosition(layout.board.x, layout.board.y);

        for (const sprite of [...this.#enemySprites, ...this.#towerSprites, ...this.#shotSprites]) {
            sprite.setScale(this.#entityScale);
        }

        this.#layoutChrome(layout);

        // Cached strings stay valid, but their positions moved.
        this.#callWaveCached = '';
        for (let i = 0; i < this.#buildCached.length; i++) this.#buildCached[i] = '';
        for (let i = 0; i < this.#buildCostCached.length; i++) this.#buildCostCached[i] = '';
        for (let i = 0; i < this.#towerCached.length; i++) this.#towerCached[i] = '';
        for (const capsule of [this.#level, this.#wave, this.#lives, this.#gold, this.#score, this.#pause]) capsule.cached = '';
    }

    /** Repositions every piece of chrome; text content is handled by `present`. */
    #layoutChrome(layout: PlayLayout): void {
        this.#place(this.#level, layout.hud.level);
        this.#place(this.#wave, layout.hud.wave);
        this.#place(this.#lives, layout.hud.lives);
        this.#place(this.#gold, layout.hud.gold);
        this.#place(this.#score, layout.hud.score);
        this.#place(this.#pause, layout.hud.pause);

        this.#callWaveImage
            .setTexture(pixelBox(this.#scene, layout.callWave.width, layout.callWave.height, 'primary'))
            .setPosition(Math.round(layout.callWave.x), Math.round(layout.callWave.y));
        this.#callWaveLabel.setPosition(
            layout.callWave.x + layout.callWave.width / 2,
            layout.callWave.y + layout.callWave.height / 2,
        );
        setUiFontSize(this.#callWaveLabel, fitFontSize(layout.callWave.width - 24, 14, 14, 8));

        this.#menuPanel
            .setTexture(pixelBox(this.#scene, layout.menu.panel.width, layout.menu.panel.height, 'panel'))
            .setPosition(Math.round(layout.menu.panel.x), Math.round(layout.menu.panel.y));
        this.#menuTitle.setPosition(layout.menu.panel.x + layout.menu.panel.width / 2, layout.menu.panel.y + 18);
        setUiFontSize(this.#menuTitle, fitFontSize(layout.menu.panel.width - 20, 19, 12, 8));

        layout.menu.buildButtons.forEach((rect, index) => {
            const image = this.#buildImages[index];
            const label = this.#buildLabels[index];
            const cost = this.#buildCosts[index];
            if (!image || !label || !cost) return;
            const type = TOWER_TYPES[index];
            image
                .setTexture(pixelBox(this.#scene, rect.width, rect.height, type ?? 'button'))
                .setPosition(Math.round(rect.x), Math.round(rect.y));
            label
                .setPosition(rect.x + rect.width / 2, rect.y + rect.height * 0.3)
                .setFontSize(fitFontSize(rect.width - 8, 8, 11, 8));
            cost
                .setPosition(rect.x + rect.width / 2, rect.y + rect.height * 0.7)
                .setFontSize(fitFontSize(rect.width - 8, 5, 9, 7));
        });
        layout.menu.towerButtons.forEach((rect, index) => {
            const image = this.#towerImages[index];
            const label = this.#towerLabels[index];
            if (!image || !label) return;
            image
                .setTexture(pixelBox(this.#scene, rect.width, rect.height, 'button'))
                .setPosition(Math.round(rect.x), Math.round(rect.y));
            label.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
            label.setFontSize(fitFontSize(rect.width - 10, 13, 11, 7));
        });

        this.#dim.setDisplaySize(layout.width, layout.height);
        this.#resumeImage
            .setTexture(pixelBox(this.#scene, layout.resume.width, layout.resume.height, 'primary'))
            .setPosition(Math.round(layout.resume.x), Math.round(layout.resume.y));
        this.#resumeLabel
            .setPosition(layout.resume.x + layout.resume.width / 2, layout.resume.y + layout.resume.height / 2)
            .setFontSize(fitFontSize(layout.resume.width - 24, 6, 14, 9));

        // Pads sit at their spot centres, sized to the pad footprint; visibility is
        // the only thing `present` changes per frame.
        const padSize = layout.board.tile * PAD_HALF * 2;
        layout.spots.forEach((spot, id) => {
            const image = this.#padImages[id];
            if (image) image.setPosition(spot.x, spot.y).setDisplaySize(padSize, padSize);
        });

        this.#banner.setPosition(layout.width / 2, layout.height * 0.4);
        this.#banner.setFontSize(fitFontSize(layout.width - 24, 21, 18, 8));
        this.#flash.setDisplaySize(layout.width, layout.height);
    }

    // -- drawing ----------------------------------------------------------

    present(snapshot: RoundSnapshot, events: readonly RoundEvent[], ui: PlayUiState, alpha: number): void {
        const layout = this.#layout;
        const transform = this.#transform;
        if (!layout || !transform) return;

        this.#selection = ui.selection;
        this.#presentHud(snapshot);
        this.#presentCallWave(snapshot);
        this.#presentMenu(snapshot, ui, layout);
        this.#presentPause(ui, layout);
        this.#presentEntities(snapshot, transform, alpha);
        this.#presentEvents(events);
        this.#setAnimsPaused(ui.paused);
    }

    /** Holds every walk cycle mid-stride while the game is paused. */
    #setAnimsPaused(paused: boolean): void {
        if (this.#animPaused === paused) return;
        this.#animPaused = paused;
        for (const sprite of this.#enemySprites) {
            if (paused) sprite.anims.pause();
            else sprite.anims.resume();
        }
    }

    #presentHud(snapshot: RoundSnapshot): void {
        const set = (capsule: Capsule, value: string): void => {
            if (capsule.cached === value) return;
            capsule.cached = value;
            capsule.label.setText(value);
        };
        set(this.#level, `LV ${snapshot.level}`);
        set(this.#wave, `W ${snapshot.wave}/${WAVES_PER_LEVEL}`);
        set(this.#lives, `HP ${Math.max(0, snapshot.lives)}`);
        set(this.#gold, `G ${formatGold(snapshot.gold)}`);
        set(this.#score, formatScore(snapshot.score));
    }

    #presentCallWave(snapshot: RoundSnapshot): void {
        const visible = snapshot.waveState === 'grace' || snapshot.waveState === 'gap';
        this.#callWaveImage.setVisible(visible);
        this.#callWaveLabel.setVisible(visible);
        if (!visible) return;

        const countdown = snapshot.waveState === 'gap' ? `  ${Math.ceil(snapshot.pendingSeconds)}S` : '';
        const value = `CALL WAVE${countdown}`;
        if (this.#callWaveCached === value) return;
        this.#callWaveCached = value;
        this.#callWaveLabel.setText(value);
    }

    #presentMenu(snapshot: RoundSnapshot, ui: PlayUiState, layout: PlayLayout): void {
        const selection = ui.selection;
        const showBuild = selection?.kind === 'spot';
        const showTower = selection?.kind === 'tower';
        const showAny = showBuild || showTower;

        this.#menuPanel.setVisible(showAny);
        this.#menuTitle.setVisible(showAny);

        for (let i = 0; i < this.#buildImages.length; i++) {
            this.#buildImages[i].setVisible(showBuild);
            this.#buildLabels[i].setVisible(showBuild);
            this.#buildCosts[i].setVisible(showBuild);
        }
        for (let i = 0; i < this.#towerImages.length; i++) {
            this.#towerImages[i].setVisible(showTower);
            this.#towerLabels[i].setVisible(showTower);
        }
        if (!showAny || selection === null) return;

        if (showBuild) {
            this.#menuTitle.setText('BUILD TOWER');
            layout.menu.buildButtons.forEach((rect, index) => {
                const type = TOWER_TYPES[index];
                if (!type) return;
                const spec = TOWER_SPECS[type];
                const affordable = snapshot.gold >= spec.cost;
                const name = type.toUpperCase();
                this.#setButton(
                    this.#buildImages[index],
                    this.#buildLabels[index],
                    this.#buildCached,
                    index,
                    name,
                    !affordable,
                    rect,
                    type,
                );
                const costValue = `${spec.cost}G`;
                const cost = this.#buildCosts[index];
                const costKey = `${costValue}:${affordable ? 1 : 0}`;
                if (this.#buildCostCached[index] !== costKey) {
                    this.#buildCostCached[index] = costKey;
                    cost.setText(costValue).setAlpha(affordable ? 1 : 0.5);
                }
            });
            return;
        }

        const towerId = selection.kind === 'tower' ? selection.towerId : -1;
        const tower = snapshot.towers.find((candidate) => candidate.id === towerId);
        if (!tower) return;

        const name = tower.type.toUpperCase();
        this.#menuTitle.setText(`${name} TOWER - LV ${tower.level}`);

        const maxed = tower.level >= 3;
        const upgradeCostValue = maxed ? 'MAX' : `${upgradeCost(tower.type, tower.level + 1)}G`;
        const canUpgrade = !maxed && snapshot.gold >= upgradeCost(tower.type, tower.level + 1);
        const refund = sellRefund(tower.spent);

        const [upgradeRect, sellRect] = layout.menu.towerButtons;
        if (!upgradeRect || !sellRect) return;
        this.#setButton(
            this.#towerImages[0],
            this.#towerLabels[0],
            this.#towerCached,
            0,
            `UPGRADE ${upgradeCostValue}`,
            !canUpgrade,
            upgradeRect,
            'primary',
        );
        this.#setButton(
            this.#towerImages[1],
            this.#towerLabels[1],
            this.#towerCached,
            1,
            `SELL +${refund}G`,
            false,
            sellRect,
            'danger',
        );
    }

    /**
     * Swaps a button between its variant and the disabled box. `enabledVariant` carries
     * the role — gold for the action that moves the round forward, the tower's colour
     * for a build, red for selling — and disabled always wins.
     */
    #setButton(
        image: Phaser.GameObjects.Image,
        label: Phaser.GameObjects.Text,
        cache: string[],
        index: number,
        value: string,
        disabled: boolean,
        rect: { x: number; y: number; width: number; height: number },
        enabledVariant: PixelVariant = 'button',
    ): void {
        const key = pixelBox(this.#scene, rect.width, rect.height, disabled ? 'disabled' : enabledVariant);
        if (image.texture.key !== key) image.setTexture(key);
        label.setAlpha(disabled ? 0.55 : 1);
        if (cache[index] === value) return;
        cache[index] = value;
        label.setText(value);
    }

    #presentPause(ui: PlayUiState, layout: PlayLayout): void {
        this.#dim.setVisible(ui.paused);
        this.#resumeImage.setVisible(ui.paused);
        this.#resumeLabel.setVisible(ui.paused);
        if (ui.paused) {
            this.#dim.setDisplaySize(layout.width, layout.height);
        }
    }

    #presentEntities(snapshot: RoundSnapshot, transform: ViewTransform, alpha: number): void {
        const tile = transform.tile;

        // Enemies: pooled sprites, positions interpolated between simulation steps.
        const enemies = snapshot.enemies;
        const enemyCount = Math.min(enemies.length, this.#enemySprites.length);
        for (let i = 0; i < this.#enemySprites.length; i++) {
            const sprite = this.#enemySprites[i];
            if (i >= enemyCount) {
                sprite.setVisible(false);
                if (sprite.anims.isPlaying) sprite.anims.stop();
                continue;
            }
            const enemy = enemies[i];
            this.#walk(sprite, enemy.type);
            const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
            const y = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
            sprite.setVisible(true).setPosition(transform.toScreenX(x), transform.toScreenY(y));
        }

        // Towers stand still; their slot is fixed for the whole round.
        const towers = snapshot.towers;
        const towerCount = Math.min(towers.length, this.#towerSprites.length);
        for (let i = 0; i < this.#towerSprites.length; i++) {
            const sprite = this.#towerSprites[i];
            if (i >= towerCount) {
                sprite.setVisible(false);
                continue;
            }
            const tower = towers[i];
            const key = `tower-${tower.type}-${tower.level}`;
            if (sprite.texture.key !== key) sprite.setTexture(key);
            // The anchor is the sprite's bottom centre, planted on the pad's bottom edge.
            sprite.setVisible(true).setPosition(transform.toScreenX(tower.x), transform.toScreenY(tower.y) + tile * PAD_HALF);
        }

        // Projectiles come from a pool; inactive slots are simply hidden.
        const projectiles = snapshot.projectiles;
        for (let i = 0; i < this.#shotSprites.length; i++) {
            const sprite = this.#shotSprites[i];
            const projectile = projectiles[i];
            if (!projectile || !projectile.active) {
                sprite.setVisible(false);
                continue;
            }
            const key = `shot-${projectile.tower}`;
            if (sprite.texture.key !== key) sprite.setTexture(key);
            const x = projectile.prevX + (projectile.x - projectile.prevX) * alpha;
            const y = projectile.prevY + (projectile.y - projectile.prevY) * alpha;
            // Arrows fly point-first; balls and shards simply follow.
            const dx = projectile.x - projectile.prevX;
            const dy = projectile.y - projectile.prevY;
            if (dx !== 0 || dy !== 0) sprite.setRotation(Math.atan2(dy, dx));
            sprite.setVisible(true).setPosition(transform.toScreenX(x), transform.toScreenY(y));
        }

        this.#presentSelection(snapshot, transform, tile);
        this.#presentHealthBars(snapshot, transform, tile);
    }

    /** Plays the enemy's walk cycle, or its static frame when the pack has no strip. */
    #walk(sprite: Phaser.GameObjects.Sprite, type: EnemyType): void {
        const animKey = `walk-${type}`;
        if (this.#animPaused) return;
        if (sprite.anims.currentAnim?.key === animKey && sprite.anims.isPlaying) return;
        if (this.#scene.anims.exists(animKey)) {
            sprite.play(animKey);
            return;
        }
        sprite.anims.stop();
        const frameKey = `enemy-${type}-0`;
        if (sprite.texture.key !== frameKey) sprite.setTexture(frameKey);
    }

    /** Empty build pads, the selection outline and the selected tower's range circle. */
    #presentSelection(snapshot: RoundSnapshot, transform: ViewTransform, tile: number): void {
        const under = this.#under;
        if (!under) return;
        under.clear();
        this.#presentPads(snapshot);

        const selection = this.#selection;
        if (!selection) return;

        if (selection.kind === 'tower') {
            const tower = snapshot.towers.find((candidate) => candidate.id === selection.towerId);
            if (tower) {
                under.lineStyle(2, COLORS.range, 0.55);
                under.strokeCircle(transform.toScreenX(tower.x), transform.toScreenY(tower.y), tower.range * tile);
                this.#padOutline(under, transform.toScreenX(tower.x), transform.toScreenY(tower.y), tile);
            }
            return;
        }

        const spot = this.#layout?.spots[selection.spotId];
        if (spot) this.#padOutline(under, spot.x, spot.y, tile);
    }

    /**
     * The build pads: pooled silver-pavement images, one per spot. A spot keeps its
     * slab until a tower stands on it, and then the tower itself marks the slot;
     * selling brings the slab back with nothing to repaint.
     */
    #presentPads(snapshot: RoundSnapshot): void {
        const spots = this.#layout?.spots;
        if (!spots) return;

        if (this.#padTaken.length !== spots.length) this.#padTaken = new Array<boolean>(spots.length).fill(false);
        else this.#padTaken.fill(false);
        for (const tower of snapshot.towers) {
            if (tower.spotId >= 0 && tower.spotId < this.#padTaken.length) this.#padTaken[tower.spotId] = true;
        }

        for (let id = 0; id < this.#padImages.length; id++) {
            this.#padImages[id].setVisible(id < spots.length && !this.#padTaken[id]);
        }
    }

    /** Selection outline: a square hugging the pad, matching the grid. */
    #padOutline(graphics: Phaser.GameObjects.Graphics, x: number, y: number, tile: number): void {
        graphics.lineStyle(Math.max(2, tile * 0.06), COLORS.select, 0.9);
        const half = tile * 0.47;
        graphics.strokeRect(x - half, y - half, half * 2, half * 2);
    }

    /** One small bar per wounded enemy, drawn in a single Graphics. */
    #presentHealthBars(snapshot: RoundSnapshot, transform: ViewTransform, tile: number): void {
        const over = this.#over;
        if (!over) return;
        over.clear();

        const width = tile * 0.6;
        const height = Math.max(3, tile * 0.1);
        for (const enemy of snapshot.enemies) {
            if (enemy.hp >= enemy.maxHp) continue;
            const x = transform.toScreenX(enemy.x) - width / 2;
            const y = transform.toScreenY(enemy.y) - tile * 0.52;
            over.fillStyle(COLORS.hpLost, 1);
            over.fillRect(x, y, width, height);
            over.fillStyle(COLORS.hp, 1);
            over.fillRect(x, y, width * Math.max(0, enemy.hp / enemy.maxHp), height);
        }
    }

    // -- events -----------------------------------------------------------

    #presentEvents(events: readonly RoundEvent[]): void {
        const now = this.#scene.time.now;

        for (const event of events) {
            switch (event.type) {
                case 'waveStarted':
                    this.#showBanner(`WAVE ${event.wave} OF ${WAVES_PER_LEVEL}`, now + 1000);
                    break;
                case 'waveCleared':
                    this.#showBanner(`WAVE CLEARED   +${event.bonus}G`, now + BANNER_MS);
                    break;
                case 'levelCleared':
                    this.#showBanner('LEVEL CLEARED!', now + BANNER_MS);
                    break;
                case 'defeat':
                    this.#showBanner('THE GATE FELL!', now + BANNER_MS);
                    break;
                case 'leak':
                    this.#flashUntil = now + FLASH_MS;
                    break;
                default:
                    // shot / hit / kill / built / upgraded / sold / blocked already show
                    // up as projectiles, gold in the HUD and the menu that just changed.
                    break;
            }
        }

        this.#banner.setVisible(now < this.#bannerUntil);
        const flashLeft = this.#flashUntil - now;
        if (flashLeft > 0) {
            this.#flash.setVisible(true).setAlpha(0.3 * (flashLeft / FLASH_MS));
        } else {
            this.#flash.setVisible(false).setAlpha(0);
        }
    }

    #showBanner(text: string, until: number): void {
        this.#banner.setText(text);
        this.#bannerUntil = until;
        this.#banner.setVisible(true);
    }

    // -- teardown ---------------------------------------------------------

    destroy(): void {
        for (const object of this.#objects) object.destroy();
        this.#objects.length = 0;

        this.#board = null;
        this.#under = null;
        this.#over = null;
        this.#enemySprites = [];
        this.#towerSprites = [];
        this.#shotSprites = [];
        this.#padImages = [];
        this.#animPaused = false;
        this.#layout = null;
        this.#map = null;
        this.#transform = null;
    }

    // -- helpers ----------------------------------------------------------

    /** The scene's current selection, so `present` can draw its ring and range. */
    #selection: Selection | null = null;

    #add<T extends Phaser.GameObjects.GameObject>(object: T): T {
        this.#objects.push(object);
        return object;
    }

    #text(
        x: number,
        y: number,
        size: number,
        color: number,
        shadow: boolean | { x?: number; y?: number } = false,
    ): Phaser.GameObjects.Text {
        // One type voice, no outline: the pixel box behind each label carries the
        // contrast. The banner sits straight on the field, so it keeps a hard shadow.
        const text = uiText(this.#scene, x, y, '', size, { color, shadow }).setOrigin(0.5).setDepth(20);
        return this.#add(text);
    }

    #capsule(rect: { x: number; y: number; width: number; height: number }, value: string): Capsule {
        const image = this.#add(
            this.#scene.add
                .image(
                    Math.round(rect.x),
                    Math.round(rect.y),
                    pixelBox(this.#scene, rect.width, rect.height, 'capsule'),
                )
                .setOrigin(0, 0)
                .setDepth(20),
        );
        const label = this.#text(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            fitFontSize(rect.width - 4, 5, 10, 7),
            COLORS.text,
        );
        label.setText(value);
        return { image, label, cached: value };
    }

    #place(capsule: Capsule, rect: { x: number; y: number; width: number; height: number }): void {
        capsule.image
            .setTexture(pixelBox(this.#scene, rect.width, rect.height, 'capsule'))
            .setPosition(Math.round(rect.x), Math.round(rect.y));
        capsule.label
            .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2)
            .setFontSize(fitFontSize(rect.width - 4, 5, 10, 7));
    }

    #button(
        rect: { x: number; y: number; width: number; height: number },
        variant: PixelVariant,
        depth = 21,
    ): Phaser.GameObjects.Image {
        return this.#add(
            this.#scene.add
                .image(Math.round(rect.x), Math.round(rect.y), pixelBox(this.#scene, rect.width, rect.height, variant))
                .setOrigin(0, 0)
                .setDepth(depth),
        );
    }

    #label(
        rect: { x: number; y: number; width: number; height: number },
        value: string,
        size: number,
        color: number = COLORS.text,
        depth = 22,
    ): Phaser.GameObjects.Text {
        return this.#text(rect.x + rect.width / 2, rect.y + rect.height / 2, size, color).setText(value).setDepth(depth);
    }
}
