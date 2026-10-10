import { HOLE_COUNT, MONSTER_RULES } from './config.ts';
import type { FieldPoint } from './config.ts';
import { SpawnScheduler } from './difficulty.ts';
import { Monster } from './monster.ts';
import type { Random } from './ports.ts';
import { ScoreState } from './scoring.ts';
import type { MonsterView, RoundPhase, WorldEvent, WorldEventSink } from './types.ts';

/**
 * The whole simulation: a fixed grid of holes, the monsters in them, the round clock and
 * the score.
 *
 * It is deliberately renderer-agnostic and DOM-free — it can be ticked headless from a
 * test, a benchmark or the Phaser scene with identical results (AGENTS.md §4.3). It talks
 * to the outside world only through events it emits.
 */
export class GameWorld {
    private readonly slots: Monster[] = [];
    private readonly scoreState = new ScoreState();
    private readonly scheduler: SpawnScheduler;
    private readonly random: Random;
    private readonly sinks: WorldEventSink[] = [];
    private currentPhase: RoundPhase = 'playing';

    constructor(random: Random = Math.random) {
        this.random = random;
        this.scheduler = new SpawnScheduler(random);
        for (let hole = 0; hole < HOLE_COUNT; hole++) {
            this.slots.push(new Monster(hole, hole));
        }
        // Same starting state as a restart, so the very first round of a session behaves
        // exactly like every Retry.
        this.reset();
    }

    /** Read-only monsters, one per hole. Same array every frame: no per-frame allocation. */
    get monsters(): readonly MonsterView[] {
        return this.slots;
    }

    get phase(): RoundPhase {
        return this.currentPhase;
    }

    get score(): number {
        return this.scoreState.score;
    }

    get lives(): number {
        return this.scoreState.lives;
    }

    get maxLives(): number {
        return this.scoreState.maxLives;
    }

    get combo(): number {
        return this.scoreState.combo;
    }

    get maxCombo(): number {
        return this.scoreState.maxCombo;
    }

    get defeated(): number {
        return this.scoreState.defeated;
    }

    /** @returns an unsubscribe function. Multiple listeners may subscribe at once. */
    subscribe(sink: WorldEventSink): () => void {
        this.sinks.push(sink);
        return () => {
            const index = this.sinks.indexOf(sink);
            if (index >= 0) this.sinks.splice(index, 1);
        };
    }

    reset(): void {
        this.currentPhase = 'playing';
        this.scoreState.reset();
        this.scheduler.reset();
        for (const monster of this.slots) monster.clear();
    }

    /**
     * Advances the round by one frame.
     *
     * @param dtSeconds elapsed time since the previous frame, in seconds.
     */
    update(dtSeconds: number): void {
        if (this.currentPhase !== 'playing') return;

        let escaped = false;
        for (const monster of this.slots) {
            if (monster.update(dtSeconds)) {
                const outcome = this.scoreState.registerEscape();
                this.emit({ type: 'monsterEscaped', hole: monster.hole, lives: outcome.lives });
                if (outcome.gameOver) {
                    this.endRound();
                    escaped = true;
                    break;
                }
            }
        }
        if (escaped) return;

        if (this.scheduler.shouldSpawn(dtSeconds, this.scoreState.defeated)) {
            this.spawnMonster();
            if (this.scheduler.wantsDoubleSpawn(this.scoreState.defeated)) {
                this.spawnMonster();
            }
        }
    }

    /**
     * Whacks whatever is under `point`. @returns true when a monster was hit.
     *
     * The reach of two neighbouring monsters overlaps: the creature art is 130 field units
     * wide on a 135-unit pitch, and the reach has to cover the whole creature, so the two
     * circles necessarily meet in the gap between them. A point in that gap is inside both
     * of them, and taking the first slot that happened to contain it would hit the
     * neighbour rather than the monster the finger was aimed at. The nearest one wins.
     */
    tap(point: FieldPoint): boolean {
        if (this.currentPhase !== 'playing') return false;

        let target: Monster | null = null;
        let targetDistance = Number.POSITIVE_INFINITY;

        for (const monster of this.slots) {
            if (!monster.contains(point)) continue;
            const distance = monster.distanceTo(point);
            if (distance >= targetDistance) continue;
            target = monster;
            targetDistance = distance;
        }
        if (target === null) return false;

        switch (target.tap()) {
            case 'deflected':
                this.emit({ type: 'monsterDeflected', hole: target.hole });
                break;
            case 'cracked':
                this.emit({ type: 'monsterCracked', hole: target.hole, hitsTaken: target.hitsTaken });
                break;
            case 'defeated':
                this.defeat(target);
                break;
            default:
                break;
        }
        return true;
    }

    /**
     * Slashes along the path `from` → `to`; only ninjas can be defeated this way.
     *
     * Every monster on the path is tested rather than only the first one: a tap-only
     * monster standing in the way must not swallow the slash, or swiping *across* a
     * normal/armored monster to reach the ninja silently does nothing — which reads as
     * "the swipe is broken".
     */
    swipe(from: FieldPoint, to: FieldPoint): boolean {
        if (this.currentPhase !== 'playing') return false;

        let slashed = false;
        for (const monster of this.slots) {
            if (!monster.hitsSegment(from, to)) continue;
            // A slash only cuts ninjas; it passes straight through the rest.
            if (!monster.swipe()) continue;

            this.defeat(monster);
            slashed = true;
        }
        return slashed;
    }

    private defeat(monster: Monster): void {
        const { earned, multiplier } = this.scoreState.registerDefeat(MONSTER_RULES[monster.kind].points);
        this.emit({
            type: 'monsterDefeated',
            hole: monster.hole,
            kind: monster.kind,
            points: MONSTER_RULES[monster.kind].points,
            earned,
            multiplier,
        });
    }

    private spawnMonster(): void {
        const available: Monster[] = [];
        for (const monster of this.slots) {
            if (monster.state === 'hidden') available.push(monster);
        }
        if (available.length === 0) return;

        const target = available[Math.floor(this.random() * available.length)];
        target.spawn(this.scheduler.nextKind(), this.scheduler.speedMultiplier(this.scoreState.defeated));
    }

    private endRound(): void {
        this.currentPhase = 'over';
        this.emit({
            type: 'roundOver',
            score: this.scoreState.score,
            defeated: this.scoreState.defeated,
            maxCombo: this.scoreState.maxCombo,
        });
    }

    private emit(event: WorldEvent): void {
        for (const sink of this.sinks) sink(event);
    }
}
