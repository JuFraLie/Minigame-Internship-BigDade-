import Phaser from 'phaser';

import { sellRefund, upgradeCost } from '../../domain/economy.ts';
import type { GameMap } from '../../domain/maps.ts';
import {
    TOWER_SPECS,
    TOWER_TYPES,
    WAVES_PER_LEVEL,
    type EnemyType,
    type RoundEvent,
    type RoundSnapshot,
} from '../../domain/types.ts';
import type { Selection } from './inputAdapter.ts';
import type { PlayLayout } from './layout.ts';
import type { GameViewPort, PlayUiState } from './playView.ts';
import { BOARD_KEY, COLORS, NOMINAL_TILE, ensureEntityTextures, ensureTextures, hex, renderBoardTexture } from './textures.ts';
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

const FONT = 'Segoe UI, Arial, sans-serif';

interface Capsule {
    readonly image: Phaser.GameObjects.Image;
    readonly label: Phaser.GameObjects.Text;
    readonly rect: { x: number; y: number; width: number; height: number };
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

        this.#enemySprites = [];
        for (let i = 0; i < ENEMY_POOL; i++) {
            this.#enemySprites.push(this.#add(scene.add.sprite(0, 0, 'enemy-grunt-0').setVisible(false).setDepth(8).setScale(this.#entityScale)));
        }
        this.#towerSprites = [];
        for (let i = 0; i < TOWER_POOL; i++) {
            this.#towerSprites.push(this.#add(scene.add.image(0, 0, 'tower-dart-1').setVisible(false).setDepth(6).setScale(this.#entityScale)));
        }
        this.#shotSprites = [];
        for (let i = 0; i < SHOT_POOL; i++) {
            this.#shotSprites.push(this.#add(scene.add.image(0, 0, 'shot-dart').setVisible(false).setDepth(10).setScale(this.#entityScale)));
        }

        this.#level = this.#capsule(layout.hud.level, 'Lv 1');
        this.#wave = this.#capsule(layout.hud.wave, 'W 1/3');
        this.#lives = this.#capsule(layout.hud.lives, '♥ 10');
        this.#gold = this.#capsule(layout.hud.gold, 'G 100');
        this.#score = this.#capsule(layout.hud.score, '0');
        this.#pause = this.#capsule(layout.hud.pause, 'II');

        this.#callWaveImage = this.#button(layout.callWave, 'ui-button-primary');
        this.#callWaveLabel = this.#label(layout.callWave, 'Call wave', 20);
        this.#callWaveCached = '';

        this.#menuPanel = this.#add(
            scene.add.image(layout.menu.panel.x, layout.menu.panel.y, 'ui-panel').setOrigin(0, 0).setDepth(20).setVisible(false),
        );
        this.#menuTitle = this.#text(layout.menu.panel.x + layout.menu.panel.width / 2, layout.menu.panel.y + 20, 17, COLORS.text).setVisible(false);

        this.#buildImages = [];
        this.#buildLabels = [];
        this.#buildCosts = [];
        this.#buildCached = [];
        for (const rect of layout.menu.buildButtons) {
            this.#buildImages.push(this.#button(rect, 'ui-button').setVisible(false));
            this.#buildLabels.push(this.#label({ ...rect, y: rect.y + 16 }, '', 16).setVisible(false));
            this.#buildCosts.push(this.#label({ ...rect, y: rect.y + rect.height - 22 }, '', 14, COLORS.textDim).setVisible(false));
            this.#buildCached.push('');
            this.#buildCostCached.push('');
        }

        this.#towerImages = [];
        this.#towerLabels = [];
        this.#towerCached = [];
        for (const rect of layout.menu.towerButtons) {
            this.#towerImages.push(this.#button(rect, 'ui-button').setVisible(false));
            this.#towerLabels.push(this.#label(rect, '', 16).setVisible(false));
            this.#towerCached.push('');
        }

        this.#dim = this.#add(
            scene.add.image(0, 0, 'ui-white').setOrigin(0, 0).setDepth(40).setAlpha(0.62).setVisible(false).setDisplaySize(layout.width, layout.height),
        );
        this.#resumeImage = this.#button(layout.resume, 'ui-button-primary', 41).setVisible(false);
        this.#resumeLabel = this.#label(layout.resume, 'Resume', 20, COLORS.text, 42).setVisible(false);

        this.#banner = this.#text(layout.width / 2, layout.height * 0.4, 26, COLORS.text).setVisible(false).setDepth(50);
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

        this.#callWaveImage.setPosition(layout.callWave.x, layout.callWave.y).setDisplaySize(layout.callWave.width, layout.callWave.height);
        this.#callWaveLabel.setPosition(layout.callWave.x + layout.callWave.width / 2, layout.callWave.y + layout.callWave.height / 2);

        this.#menuPanel.setPosition(layout.menu.panel.x, layout.menu.panel.y).setDisplaySize(layout.menu.panel.width, layout.menu.panel.height);
        this.#menuTitle.setPosition(layout.menu.panel.x + layout.menu.panel.width / 2, layout.menu.panel.y + 20);

        layout.menu.buildButtons.forEach((rect, index) => {
            const image = this.#buildImages[index];
            const label = this.#buildLabels[index];
            const cost = this.#buildCosts[index];
            if (!image || !label || !cost) return;
            image.setPosition(rect.x, rect.y).setDisplaySize(rect.width, rect.height);
            label.setPosition(rect.x + rect.width / 2, rect.y + 18);
            cost.setPosition(rect.x + rect.width / 2, rect.y + rect.height - 20);
        });
        layout.menu.towerButtons.forEach((rect, index) => {
            const image = this.#towerImages[index];
            const label = this.#towerLabels[index];
            if (!image || !label) return;
            image.setPosition(rect.x, rect.y).setDisplaySize(rect.width, rect.height);
            label.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
        });

        this.#dim.setDisplaySize(layout.width, layout.height);
        this.#resumeImage.setPosition(layout.resume.x, layout.resume.y).setDisplaySize(layout.resume.width, layout.resume.height);
        this.#resumeLabel.setPosition(layout.resume.x + layout.resume.width / 2, layout.resume.y + layout.resume.height / 2);

        this.#banner.setPosition(layout.width / 2, layout.height * 0.4);
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
        set(this.#level, `Lv ${snapshot.level}`);
        set(this.#wave, `W ${snapshot.wave}/${WAVES_PER_LEVEL}`);
        set(this.#lives, `♥ ${Math.max(0, snapshot.lives)}`);
        set(this.#gold, `G ${formatGold(snapshot.gold)}`);
        set(this.#score, formatScore(snapshot.score));
    }

    #presentCallWave(snapshot: RoundSnapshot): void {
        const visible = snapshot.waveState === 'grace' || snapshot.waveState === 'gap';
        this.#callWaveImage.setVisible(visible);
        this.#callWaveLabel.setVisible(visible);
        if (!visible) return;

        const countdown = snapshot.waveState === 'gap' ? `  ${Math.ceil(snapshot.pendingSeconds)}s` : '';
        const value = `Call wave${countdown}`;
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
            this.#menuTitle.setText('Build tower');
            layout.menu.buildButtons.forEach((_rect, index) => {
                const type = TOWER_TYPES[index];
                if (!type) return;
                const spec = TOWER_SPECS[type];
                const affordable = snapshot.gold >= spec.cost;
                const name = type.charAt(0).toUpperCase() + type.slice(1);
                this.#setButton(this.#buildImages[index], this.#buildLabels[index], this.#buildCached, index, `${name}`, !affordable);
                const costValue = `${spec.cost}g`;
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

        const name = tower.type.charAt(0).toUpperCase() + tower.type.slice(1);
        this.#menuTitle.setText(`${name} tower  ·  Lv ${tower.level}`);

        const maxed = tower.level >= 3;
        const upgradeCostValue = maxed ? 'Max level' : `${upgradeCost(tower.type, tower.level + 1)}g`;
        const canUpgrade = !maxed && snapshot.gold >= upgradeCost(tower.type, tower.level + 1);
        const refund = sellRefund(tower.spent);

        this.#setButton(this.#towerImages[0], this.#towerLabels[0], this.#towerCached, 0, `Upgrade  ${upgradeCostValue}`, !canUpgrade);
        this.#setButton(this.#towerImages[1], this.#towerLabels[1], this.#towerCached, 1, `Sell  +${refund}g`, false);
    }

    #setButton(
        image: Phaser.GameObjects.Image,
        label: Phaser.GameObjects.Text,
        cache: string[],
        index: number,
        value: string,
        disabled: boolean,
    ): void {
        const key = disabled ? 'ui-button-disabled' : 'ui-button';
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
            sprite.setVisible(true).setPosition(transform.toScreenX(tower.x), transform.toScreenY(tower.y));
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

    /** Selection ring and the selected tower's range circle. */
    #presentSelection(snapshot: RoundSnapshot, transform: ViewTransform, tile: number): void {
        const under = this.#under;
        if (!under) return;
        under.clear();

        const selection = this.#selection;
        if (!selection) return;

        if (selection.kind === 'tower') {
            const tower = snapshot.towers.find((candidate) => candidate.id === selection.towerId);
            if (tower) {
                under.lineStyle(2, COLORS.range, 0.55);
                under.strokeCircle(transform.toScreenX(tower.x), transform.toScreenY(tower.y), tower.range * tile);
                this.#ring(under, transform.toScreenX(tower.x), transform.toScreenY(tower.y), tile);
            }
            return;
        }

        const spot = this.#layout?.spots[selection.spotId];
        if (spot) this.#ring(under, spot.x, spot.y, tile);
    }

    #ring(graphics: Phaser.GameObjects.Graphics, x: number, y: number, tile: number): void {
        graphics.lineStyle(Math.max(2, tile * 0.06), COLORS.range, 0.9);
        graphics.strokeCircle(x, y, tile * 0.5);
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
                    this.#showBanner(`Wave ${event.wave} of ${WAVES_PER_LEVEL}`, now + 1000);
                    break;
                case 'waveCleared':
                    this.#showBanner(`Wave cleared   +${event.bonus}g`, now + BANNER_MS);
                    break;
                case 'levelCleared':
                    this.#showBanner('Level cleared!', now + BANNER_MS);
                    break;
                case 'defeat':
                    this.#showBanner('The gate fell!', now + BANNER_MS);
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

    #text(x: number, y: number, size: number, color: number): Phaser.GameObjects.Text {
        const text = this.#scene.add
            .text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, color: hex(color) })
            .setOrigin(0.5)
            .setDepth(20);
        return this.#add(text);
    }

    #capsule(rect: { x: number; y: number; width: number; height: number }, value: string): Capsule {
        const image = this.#add(
            this.#scene.add
                .image(rect.x, rect.y, 'ui-capsule')
                .setOrigin(0, 0)
                .setDepth(20)
                .setDisplaySize(rect.width, rect.height),
        );
        const label = this.#text(rect.x + rect.width / 2, rect.y + rect.height / 2, 14, COLORS.text);
        label.setText(value);
        return { image, label, rect, cached: value };
    }

    #place(capsule: Capsule, rect: { x: number; y: number; width: number; height: number }): void {
        capsule.image.setPosition(rect.x, rect.y).setDisplaySize(rect.width, rect.height);
        capsule.label.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }

    #button(rect: { x: number; y: number; width: number; height: number }, key: string, depth = 21): Phaser.GameObjects.Image {
        return this.#add(
            this.#scene.add.image(rect.x, rect.y, key).setOrigin(0, 0).setDepth(depth).setDisplaySize(rect.width, rect.height),
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
