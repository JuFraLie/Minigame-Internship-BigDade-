import {
    DODGE_RATE,
    EMERGE_RATE,
    HIT_FLASH_RATE,
    HIT_RADIUS_RATIO,
    HOLE_RADIUS,
    MIN_STAY_MS,
    MONSTER_RULES,
    RETREAT_RATE,
    RISE_DISTANCE_RATIO,
    WHACKED_SINK_RATE,
    holePosition,
} from './config.ts';
import type { FieldPoint, MonsterKind, MonsterRules } from './config.ts';
import type { MonsterState, MonsterView } from './types.ts';

export type TapOutcome = 'none' | 'deflected' | 'cracked' | 'defeated';

/**
 * One monster in one hole: lifecycle, hit rules and field-space geometry.
 *
 * Positions live in field coordinates only — the renderer decides where a hole appears on
 * screen, so this class never sees a pixel of the display.
 */
export class Monster implements MonsterView {
    readonly id: number;
    readonly hole: number;

    kind: MonsterKind = 'normal';
    state: MonsterState = 'hidden';
    rise = 0;
    hitsTaken = 0;
    flash = 0;
    dodge = 0;

    private timerMs = 0;
    private stayMs = 0;
    private readonly x: number;
    private readonly y: number;
    private rules: MonsterRules = MONSTER_RULES.normal;

    constructor(id: number, hole: number) {
        this.id = id;
        this.hole = hole;
        const position = holePosition(hole);
        this.x = position.x;
        this.y = position.y;
    }

    /** True while the monster can be hit. */
    get hittable(): boolean {
        return this.state === 'active' || this.state === 'emerging';
    }

    spawn(kind: MonsterKind, speedMultiplier: number): void {
        this.kind = kind;
        this.rules = MONSTER_RULES[kind];
        this.state = 'emerging';
        this.rise = 0;
        this.hitsTaken = 0;
        this.flash = 0;
        this.dodge = 0;
        this.timerMs = 0;
        this.stayMs = Math.max(MIN_STAY_MS, this.rules.stayMs / speedMultiplier);
    }

    /** Puts the monster back in its hole without a retreat animation (round reset). */
    clear(): void {
        this.state = 'hidden';
        this.rise = 0;
        this.hitsTaken = 0;
        this.flash = 0;
        this.dodge = 0;
        this.timerMs = 0;
        this.kind = 'normal';
        this.rules = MONSTER_RULES.normal;
    }

    /**
     * Advances the lifecycle.
     *
     * @returns true exactly once, when the monster runs out of time and escapes.
     */
    update(dtSeconds: number): boolean {
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dtSeconds * HIT_FLASH_RATE);
        if (this.dodge > 0) this.dodge = Math.max(0, this.dodge - dtSeconds * DODGE_RATE);

        switch (this.state) {
            case 'emerging':
                this.rise += dtSeconds * EMERGE_RATE;
                if (this.rise >= 1) {
                    this.rise = 1;
                    this.state = 'active';
                    this.timerMs = 0;
                }
                return false;
            case 'active':
                this.timerMs += dtSeconds * 1000;
                if (this.timerMs >= this.stayMs) {
                    this.state = 'retreating';
                    return true;
                }
                return false;
            case 'retreating':
            case 'whacked':
                this.rise -= dtSeconds * (this.state === 'whacked' ? WHACKED_SINK_RATE : RETREAT_RATE);
                if (this.rise <= 0) {
                    this.rise = 0;
                    this.state = 'hidden';
                }
                return false;
            default:
                return false;
        }
    }

    /** Hit test in field coordinates, against the monster's current (risen) centre. */
    contains(point: FieldPoint): boolean {
        if (!this.hittable) return false;
        return this.distanceTo(point) <= HOLE_RADIUS * HIT_RADIUS_RATIO;
    }

    /**
     * Swipe hit test: whether the path from `from` to `to` passes through the monster.
     *
     * A swipe is a motion, so testing only where the finger lifted makes a slash that
     * ends just past the ninja miss — which reads as "the swipe did nothing".
     */
    hitsSegment(from: FieldPoint, to: FieldPoint): boolean {
        if (!this.hittable) return false;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const lengthSquared = dx * dx + dy * dy;
        const centre = this.centre();

        const t =
            lengthSquared === 0
                ? 0
                : Math.max(0, Math.min(1, ((centre.x - from.x) * dx + (centre.y - from.y) * dy) / lengthSquared));

        return this.distanceTo({ x: from.x + t * dx, y: from.y + t * dy }) <= HOLE_RADIUS * HIT_RADIUS_RATIO;
    }

    /**
     * Distance from the monster's risen centre to `point`, in field units.
     *
     * Public because a point can fall inside the reach of two neighbouring monsters at
     * once (the reach has to cover the whole creature, and the creatures sit closer
     * together than twice that reach); whoever is asked to resolve the hit picks the
     * nearest one rather than the first one it happened to visit.
     */
    distanceTo(point: FieldPoint): number {
        const centre = this.centre();
        const dx = point.x - centre.x;
        const dy = point.y - centre.y;
        return Math.hypot(dx, dy);
    }

    /** Where the monster currently sits, risen above its hole. */
    private centre(): FieldPoint {
        return { x: this.x, y: this.y - this.rise * (HOLE_RADIUS * RISE_DISTANCE_RATIO) };
    }

    tap(): TapOutcome {
        if (!this.hittable) return 'none';

        if (this.rules.requiresSwipe) {
            this.dodge = 1;
            return 'deflected';
        }

        this.hitsTaken += 1;
        this.flash = 1;

        if (this.hitsTaken >= this.rules.requiredHits) {
            this.state = 'whacked';
            return 'defeated';
        }
        return 'cracked';
    }

    swipe(): boolean {
        if (!this.hittable || !this.rules.requiresSwipe) return false;

        this.hitsTaken = 1;
        this.state = 'whacked';
        return true;
    }

    /** Base points for this monster, straight from the rules table. */
    get points(): number {
        return this.rules.points;
    }
}
