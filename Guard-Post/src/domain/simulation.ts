import { applySlow, effectiveDamage, noSlow, speedMultiplier, tickSlow, type SlowState } from './damage.ts';
import { earlyCallBonus, killReward, sellRefund, startingGold, upgradeCost, waveClearBonus } from './economy.ts';
import { generateLevelPlan, type SpawnEntry } from './levelGenerator.ts';
import type { MapSource } from './map/types.ts';
import { measureRoad, pointOnRoad, type GameMap, type Road } from './maps.ts';
import { killScore, levelClearScore, waveClearScore } from './score.ts';
import {
    ENEMY_SPECS,
    FROST_SLOW_BY_LEVEL,
    GRACE_SECONDS,
    HP_GROWTH_PER_LEVEL,
    MAX_TOWER_LEVEL,
    SIM_DT,
    STARTING_LIVES,
    TOWER_SPECS,
    UPGRADE_DAMAGE_FACTOR,
    UPGRADE_RANGE_BONUS,
    WAVES_PER_LEVEL,
    WAVE_GAP_SECONDS,
    type BlockReason,
    type EnemyType,
    type EnemyView,
    type GameCommand,
    type ProjectileView,
    type RoundEvent,
    type RoundPhase,
    type RoundSnapshot,
    type TowerType,
    type TowerView,
    type Vec2,
    type WaveState,
} from './types.ts';

/**
 * The round: towers, enemies, waves, economy and scoring, stepped at a fixed 30 Hz.
 *
 * This is the whole game, and it never learns that a renderer exists. It is pure
 * TypeScript — no Phaser, no DOM, no pixels — so the same class drives the on-screen
 * game, the headless bot runs and the performance benchmarks.
 *
 * Snapshots expose live arrays that are mutated in place; they are only valid until the
 * next `step()`.
 */

/** Pooled projectiles; one round never needs more than this at once. */
const PROJECTILE_POOL = 160;
/** Projectile travel speed in tiles per second — fast enough to feel like a hitscan. */
const PROJECTILE_SPEED = 16;

// ---------------------------------------------------------------------------
// Internal mutable state. Structurally assignable to the read-only *View types.
// ---------------------------------------------------------------------------

interface EnemyState {
    id: number;
    type: EnemyType;
    hp: number;
    maxHp: number;
    armor: number;
    speed: number;
    progress: number;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    slow: SlowState;
    alive: boolean;
}

interface TowerState {
    id: number;
    spotId: number;
    type: TowerType;
    level: number;
    x: number;
    y: number;
    range: number;
    damage: number;
    fireRate: number;
    armorPierce: number;
    splash: number;
    slow: number;
    slowSeconds: number;
    /** Seconds until the next shot; 0 means ready. */
    cooldown: number;
    spent: number;
}

interface ProjectileState {
    active: boolean;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    tower: TowerType;
    damage: number;
    armorPierce: number;
    splash: number;
    slow: number;
    slowSeconds: number;
    speed: number;
    targetId: number;
    tx: number;
    ty: number;
}

function createProjectile(): ProjectileState {
    return {
        active: false,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        tower: 'dart',
        damage: 0,
        armorPierce: 0,
        splash: 0,
        slow: 0,
        slowSeconds: 0,
        speed: PROJECTILE_SPEED,
        targetId: -1,
        tx: 0,
        ty: 0,
    };
}

export class Simulation {
    readonly level: number;
    readonly mapIndex: number;
    readonly map: GameMap;
    readonly road: Road;

    phase: RoundPhase = 'playing';
    lives: number;
    gold: number;
    score = 0;
    wave = 1;
    waveState: WaveState = 'grace';

    readonly #plan: readonly (readonly SpawnEntry[])[];
    readonly #enemies: EnemyState[] = [];
    readonly #towers: TowerState[] = [];
    readonly #projectiles: ProjectileState[] = [];
    readonly #events: RoundEvent[] = [];
    readonly #scratch: Vec2 = { x: 0, y: 0 };

    /** Seconds left in the grace period or the gap before the next wave. */
    #pending = GRACE_SECONDS;
    #waveTime = 0;
    #spawnIndex = 0;
    #nextEnemyId = 1;
    #nextTowerId = 1;
    #enemiesDirty = false;
    #projectileCursor = 0;

    constructor(level: number, maps: MapSource) {
        this.level = level;
        // The round asks the port for a layout and adapts it to the renderer's shape:
        // the name seeds the scenery, the theme picks the grass and castle.
        const definition = maps.getMap(level);
        this.map = {
            name: `Level ${level}`,
            theme: (level - 1) % 3,
            waypoints: definition.waypoints,
            spots: definition.spots.map((spot) => ({ x: spot.x, y: spot.y })),
        };
        this.mapIndex = this.map.theme;
        this.road = measureRoad(this.map);
        this.lives = STARTING_LIVES;
        this.gold = startingGold(level);
        this.#plan = generateLevelPlan(level);
        for (let i = 0; i < PROJECTILE_POOL; i++) this.#projectiles.push(createProjectile());
    }

    // -- views ------------------------------------------------------------

    get pendingSeconds(): number {
        return this.#pending;
    }

    get enemies(): readonly EnemyView[] {
        return this.#enemies;
    }

    get towers(): readonly TowerView[] {
        return this.#towers;
    }

    get projectiles(): readonly ProjectileView[] {
        return this.#projectiles;
    }

    get spawnsLeft(): number {
        if (this.waveState === 'grace') return this.#plan[0]?.length ?? 0;
        if (this.waveState === 'active') return Math.max(0, this.#plan[this.wave - 1].length - this.#spawnIndex);
        return 0;
    }

    /** A fresh snapshot object over the live entity arrays (valid until the next step). */
    snapshot(): RoundSnapshot {
        return {
            level: this.level,
            mapIndex: this.mapIndex,
            phase: this.phase,
            lives: this.lives,
            gold: this.gold,
            score: this.score,
            wave: this.wave,
            waveState: this.waveState,
            pendingSeconds: this.#pending,
            spawnsLeft: this.spawnsLeft,
            enemies: this.#enemies,
            towers: this.#towers,
            projectiles: this.projectiles,
        };
    }

    /**
     * Hands the events emitted since the last drain to `out`, then clears them.
     * Without an `out` the events are simply discarded.
     */
    drainEvents(out?: RoundEvent[]): void {
        if (out) for (const event of this.#events) out.push(event);
        this.#events.length = 0;
    }

    // -- commands ---------------------------------------------------------

    /** Applies a player command; returns whether it was accepted. */
    handle(command: GameCommand): boolean {
        switch (command.kind) {
            case 'build':
                return this.build(command.spotId, command.tower);
            case 'upgrade':
                return this.upgrade(command.towerId);
            case 'sell':
                return this.sell(command.towerId);
            case 'callWave':
                return this.callWave();
        }
    }

    build(spotId: number, type: TowerType): boolean {
        if (this.phase !== 'playing') return false;
        this.#markInteracted();

        const spot = this.map.spots[spotId];
        if (!spot) {
            this.#block('noSpot');
            return false;
        }
        if (this.#towerAtSpot(spotId)) {
            this.#block('occupied');
            return false;
        }
        const spec = TOWER_SPECS[type];
        if (this.gold < spec.cost) {
            this.#block('gold');
            return false;
        }

        this.gold -= spec.cost;
        const tower: TowerState = {
            id: this.#nextTowerId++,
            spotId,
            type,
            level: 1,
            x: spot.x,
            y: spot.y,
            range: spec.range,
            damage: spec.damage,
            fireRate: spec.fireRate,
            armorPierce: spec.armorPierce,
            splash: spec.splash,
            slow: spec.slow,
            slowSeconds: spec.slowSeconds,
            cooldown: 0,
            spent: spec.cost,
        };
        this.#towers.push(tower);
        this.#emit({ type: 'built', spotId, towerId: tower.id, tower: type, gold: this.gold });
        return true;
    }

    upgrade(towerId: number): boolean {
        if (this.phase !== 'playing') return false;
        this.#markInteracted();

        const tower = this.#towerById(towerId);
        if (!tower) {
            this.#block('noTower');
            return false;
        }
        if (tower.level >= MAX_TOWER_LEVEL) {
            this.#block('maxLevel');
            return false;
        }
        const cost = upgradeCost(tower.type, tower.level + 1);
        if (this.gold < cost) {
            this.#block('gold');
            return false;
        }

        this.gold -= cost;
        tower.spent += cost;
        tower.level += 1;

        // Upgrades are absolute from the base stats: level 3 is x1.9 damage and +0.4 range.
        const spec = TOWER_SPECS[tower.type];
        const index = tower.level - 1;
        tower.damage = spec.damage * UPGRADE_DAMAGE_FACTOR[index];
        tower.range = spec.range + UPGRADE_RANGE_BONUS[index];
        if (tower.type === 'frost') tower.slow = FROST_SLOW_BY_LEVEL[index];

        this.#emit({ type: 'upgraded', towerId, level: tower.level, gold: this.gold });
        return true;
    }

    sell(towerId: number): boolean {
        if (this.phase !== 'playing') return false;
        this.#markInteracted();

        const index = this.#towers.findIndex((tower) => tower.id === towerId);
        if (index < 0) {
            this.#block('noTower');
            return false;
        }
        const tower = this.#towers[index];
        const refund = sellRefund(tower.spent);
        this.gold += refund;
        this.#towers.splice(index, 1);
        this.#emit({ type: 'sold', towerId, refund, gold: this.gold });
        return true;
    }

    /**
     * Starts the next wave now.
     *
     * During the opening grace period it simply starts wave 1 (the grace is free to
     * skip); during a gap it pays 2 gold per full second skipped.
     */
    callWave(): boolean {
        if (this.phase !== 'playing') return false;

        if (this.waveState === 'gap') {
            this.gold += earlyCallBonus(this.#pending);
            this.#startWave(this.wave);
            return true;
        }
        if (this.waveState === 'grace') {
            this.#startWave(1);
            return true;
        }
        this.#block('noWave');
        return false;
    }

    // -- simulation -------------------------------------------------------

    /** Advances the round by one fixed step (30 Hz by default). */
    step(dt: number = SIM_DT): void {
        if (this.phase !== 'playing') return;

        if (this.waveState === 'grace' || this.waveState === 'gap') {
            this.#pending -= dt;
            if (this.#pending <= 0) {
                this.#pending = 0;
                this.#startWave(this.waveState === 'grace' ? 1 : this.wave);
            }
        }

        if (this.waveState === 'active') {
            this.#waveTime += dt;
            const schedule = this.#plan[this.wave - 1];
            while (this.#spawnIndex < schedule.length && schedule[this.#spawnIndex].time <= this.#waveTime) {
                this.#spawn(schedule[this.#spawnIndex].type);
                this.#spawnIndex += 1;
            }
        }

        this.#moveEnemies(dt);
        if (this.phase !== 'playing') return; // a leak emptied the lives

        this.#fireTowers(dt);
        this.#advanceProjectiles(dt);
        this.#checkWaveEnd();
    }

    // -- internals --------------------------------------------------------

    #markInteracted(): void {
        // The first interaction of a round starts wave 1; the 10 s grace only exists
        // for a player who never acts.
        if (this.waveState === 'grace') this.#startWave(1);
    }

    #startWave(wave: number): void {
        this.wave = wave;
        this.waveState = 'active';
        this.#waveTime = 0;
        this.#spawnIndex = 0;
        this.#pending = 0;
        this.#emit({ type: 'waveStarted', wave });
    }

    #spawn(type: EnemyType): void {
        const spec = ENEMY_SPECS[type];
        const hp = Math.round(spec.hp * HP_GROWTH_PER_LEVEL ** (this.level - 1));
        const enemy: EnemyState = {
            id: this.#nextEnemyId++,
            type,
            hp,
            maxHp: hp,
            armor: spec.armor,
            speed: spec.speed,
            progress: 0,
            x: 0,
            y: 0,
            prevX: 0,
            prevY: 0,
            slow: noSlow(),
            alive: true,
        };
        pointOnRoad(this.map, this.road, 0, this.#scratch);
        enemy.x = this.#scratch.x;
        enemy.y = this.#scratch.y;
        enemy.prevX = enemy.x;
        enemy.prevY = enemy.y;
        this.#enemies.push(enemy);
    }

    #moveEnemies(dt: number): void {
        for (let i = 0; i < this.#enemies.length; i++) {
            const enemy = this.#enemies[i];
            if (!enemy.alive) continue;

            enemy.prevX = enemy.x;
            enemy.prevY = enemy.y;
            tickSlow(enemy.slow, dt);
            enemy.progress += enemy.speed * speedMultiplier(enemy.slow) * dt;

            if (enemy.progress >= this.road.total) {
                enemy.alive = false;
                this.#enemiesDirty = true;
                this.lives -= ENEMY_SPECS[enemy.type].leak;
                this.#emit({ type: 'leak', enemyId: enemy.id, enemy: enemy.type, lives: this.lives });
            } else {
                pointOnRoad(this.map, this.road, enemy.progress, this.#scratch);
                enemy.x = this.#scratch.x;
                enemy.y = this.#scratch.y;
            }
        }
        this.#compactEnemies();

        if (this.lives <= 0 && this.phase === 'playing') {
            this.phase = 'lost';
            this.#emit({ type: 'defeat', score: this.score });
        }
    }

    #fireTowers(dt: number): void {
        for (let i = 0; i < this.#towers.length; i++) {
            const tower = this.#towers[i];
            if (tower.cooldown > 0) {
                tower.cooldown -= dt;
                if (tower.cooldown > 0) continue;
            }
            const target = this.#firstInRange(tower);
            if (!target) continue;
            tower.cooldown = 1 / tower.fireRate;
            this.#spawnProjectile(tower, target);
        }
    }

    /** The First enemy in range: the one furthest along the road. */
    #firstInRange(tower: TowerState): EnemyState | null {
        const rangeSquared = tower.range * tower.range;
        let best: EnemyState | null = null;
        for (let i = 0; i < this.#enemies.length; i++) {
            const enemy = this.#enemies[i];
            if (!enemy.alive) continue;
            const dx = enemy.x - tower.x;
            const dy = enemy.y - tower.y;
            if (dx * dx + dy * dy > rangeSquared) continue;
            if (!best || enemy.progress > best.progress) best = enemy;
        }
        return best;
    }

    #spawnProjectile(tower: TowerState, target: EnemyState): void {
        const projectile = this.#takeProjectile();
        if (!projectile) return;

        projectile.active = true;
        projectile.tower = tower.type;
        projectile.x = tower.x;
        projectile.y = tower.y;
        projectile.prevX = tower.x;
        projectile.prevY = tower.y;
        projectile.damage = tower.damage;
        projectile.armorPierce = tower.armorPierce;
        projectile.splash = tower.splash;
        projectile.slow = tower.slow;
        projectile.slowSeconds = tower.slowSeconds;
        projectile.speed = PROJECTILE_SPEED;
        projectile.targetId = target.id;
        projectile.tx = target.x;
        projectile.ty = target.y;

        this.#emit({ type: 'shot', towerId: tower.id, tower: tower.type, x: tower.x, y: tower.y });
    }

    #takeProjectile(): ProjectileState | null {
        for (let i = 0; i < this.#projectiles.length; i++) {
            const index = (this.#projectileCursor + i) % this.#projectiles.length;
            const projectile = this.#projectiles[index];
            if (!projectile.active) {
                this.#projectileCursor = (index + 1) % this.#projectiles.length;
                return projectile;
            }
        }
        return null;
    }

    #advanceProjectiles(dt: number): void {
        let impacted = false;
        for (let i = 0; i < this.#projectiles.length; i++) {
            const projectile = this.#projectiles[i];
            if (!projectile.active) continue;

            projectile.prevX = projectile.x;
            projectile.prevY = projectile.y;

            const target = projectile.targetId >= 0 ? this.#enemyById(projectile.targetId) : null;
            if (target && target.alive) {
                projectile.tx = target.x;
                projectile.ty = target.y;
            }

            const dx = projectile.tx - projectile.x;
            const dy = projectile.ty - projectile.y;
            const distance = Math.hypot(dx, dy);
            const travel = projectile.speed * dt;

            if (distance <= travel) {
                projectile.x = projectile.tx;
                projectile.y = projectile.ty;
                projectile.active = false;
                this.#impact(projectile, target);
                impacted = true;
            } else if (distance > 0) {
                projectile.x += (dx / distance) * travel;
                projectile.y += (dy / distance) * travel;
            }
        }
        if (impacted) this.#compactEnemies();
    }

    #impact(projectile: ProjectileState, primary: EnemyState | null): void {
        if (projectile.splash > 0) {
            const radiusSquared = projectile.splash * projectile.splash;
            for (let i = 0; i < this.#enemies.length; i++) {
                const enemy = this.#enemies[i];
                if (!enemy.alive) continue;
                const dx = enemy.x - projectile.x;
                const dy = enemy.y - projectile.y;
                if (dx * dx + dy * dy <= radiusSquared) this.#damageEnemy(enemy, projectile);
            }
            return;
        }
        if (primary && primary.alive) this.#damageEnemy(primary, projectile);
    }

    #damageEnemy(enemy: EnemyState, projectile: ProjectileState): void {
        const dealt = effectiveDamage(projectile.damage, enemy.armor, projectile.armorPierce);
        enemy.hp -= dealt;
        this.#emit({ type: 'hit', x: enemy.x, y: enemy.y, damage: dealt });

        if (projectile.slow > 0) {
            applySlow(enemy.slow, projectile.slow, projectile.slowSeconds, enemy.type === 'boss');
        }

        if (enemy.hp <= 0 && enemy.alive) {
            enemy.alive = false;
            this.#enemiesDirty = true;
            const reward = killReward(enemy.type, this.level);
            const points = killScore(enemy.type, this.level);
            this.gold += reward;
            this.score += points;
            this.#emit({ type: 'kill', enemyId: enemy.id, enemy: enemy.type, x: enemy.x, y: enemy.y, reward, score: points });
        }
    }

    #checkWaveEnd(): void {
        if (this.waveState !== 'active') return;
        const schedule = this.#plan[this.wave - 1];
        if (this.#spawnIndex < schedule.length) return;
        if (this.#enemies.length > 0) return;

        const bonus = waveClearBonus(this.level);
        const points = waveClearScore(this.level);
        this.gold += bonus;
        this.score += points;
        this.#emit({ type: 'waveCleared', wave: this.wave, bonus, score: points });

        if (this.wave >= WAVES_PER_LEVEL) {
            this.waveState = 'done';
            this.phase = 'won';
            this.score += levelClearScore(this.lives, this.level);
            this.#emit({ type: 'levelCleared', score: this.score, lives: this.lives });
            return;
        }

        this.wave += 1;
        this.waveState = 'gap';
        this.#pending = WAVE_GAP_SECONDS;
    }

    #compactEnemies(): void {
        if (!this.#enemiesDirty) return;
        this.#enemiesDirty = false;
        let write = 0;
        for (let read = 0; read < this.#enemies.length; read++) {
            const enemy = this.#enemies[read];
            if (enemy.alive) this.#enemies[write++] = enemy;
        }
        this.#enemies.length = write;
    }

    #enemyById(id: number): EnemyState | null {
        for (let i = 0; i < this.#enemies.length; i++) {
            if (this.#enemies[i].id === id) return this.#enemies[i];
        }
        return null;
    }

    #towerById(id: number): TowerState | null {
        for (let i = 0; i < this.#towers.length; i++) {
            if (this.#towers[i].id === id) return this.#towers[i];
        }
        return null;
    }

    #towerAtSpot(spotId: number): TowerState | null {
        for (let i = 0; i < this.#towers.length; i++) {
            if (this.#towers[i].spotId === spotId) return this.#towers[i];
        }
        return null;
    }

    #block(reason: BlockReason): void {
        this.#emit({ type: 'blocked', reason });
    }

    #emit(event: RoundEvent): void {
        this.#events.push(event);
    }
}
