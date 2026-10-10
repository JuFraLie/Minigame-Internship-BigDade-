import type { MonsterKind } from './config.ts';

export type MonsterState = 'hidden' | 'emerging' | 'active' | 'retreating' | 'whacked';

export type RoundPhase = 'playing' | 'over';

/**
 * Read-only view of a monster. The renderer consumes exactly this shape, so rendering
 * depends on a port rather than on the simulation class that produces it.
 */
export interface MonsterView {
    readonly id: number;
    /** Hole slot the monster belongs to; also its position, see `holePosition`. */
    readonly hole: number;
    readonly kind: MonsterKind;
    readonly state: MonsterState;
    /** True while the monster can be hit: `active` or `emerging`. */
    readonly hittable: boolean;
    /** 0 = fully inside the hole, 1 = fully risen. */
    readonly rise: number;
    /** Taps landed so far (armored monsters need two). */
    readonly hitsTaken: number;
    /** 0..1 white hit flash. */
    readonly flash: number;
    /** 0..1 shake left over from a deflected tap. */
    readonly dodge: number;
}

/**
 * Everything the outside world may learn about the simulation. Events are the only way
 * side effects (audio, host bridge, particles) are triggered: the core never calls out
 * to a component that might not exist (AGENTS.md §4.3).
 */
export type WorldEvent =
    | { type: 'monsterDefeated'; hole: number; kind: MonsterKind; points: number; earned: number; multiplier: number }
    | { type: 'monsterCracked'; hole: number; hitsTaken: number }
    | { type: 'monsterDeflected'; hole: number }
    | { type: 'monsterEscaped'; hole: number; lives: number }
    | { type: 'roundOver'; score: number; defeated: number; maxCombo: number };

export type WorldEventSink = (event: WorldEvent) => void;

export interface DefeatOutcome {
    earned: number;
    multiplier: number;
}

export interface EscapeOutcome {
    lives: number;
    gameOver: boolean;
}
