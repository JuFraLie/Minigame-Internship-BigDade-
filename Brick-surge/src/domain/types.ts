/** Shared domain types: brick/power-up kinds, phases and the typed event union. */

export type BrickKind = 'basic' | 'sturdy' | 'tough';

export type PowerUpKind =
    | 'multi'
    | 'wide'
    | 'slow'
    | 'fire'
    | 'shield'
    | 'life'
    | 'shrink';

export const POWER_UP_KINDS: readonly PowerUpKind[] = [
    'multi', 'wide', 'slow', 'fire', 'shield', 'life', 'shrink',
];

/** A live brick in world units (x/y = top-left corner). */
export interface Brick {
    id: number;
    kind: BrickKind;
    x: number;
    y: number;
    w: number;
    h: number;
    hp: number;
    maxHp: number;
}

/** A live ball in world units (x/y = centre). */
export interface Ball {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    alive: boolean;
}

/** A falling power-up drop in world units (x/y = centre). */
export interface Drop {
    id: number;
    kind: PowerUpKind;
    x: number;
    y: number;
    vy: number;
    alive: boolean;
}

/** Axis-aligned rectangle, x/y = centre. */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type RoundPhase = 'idle' | 'serving' | 'playing' | 'banner' | 'ended';

/** Typed events the domain emits through {@link EventSinkPort}. */
export type DomainEvent =
    | { type: 'roundStarted'; wave: number }
    | { type: 'waveBanner'; wave: number }
    | { type: 'waveStarted'; wave: number }
    | { type: 'waveCleared'; wave: number; bonus: number }
    | { type: 'lifeLost'; livesLeft: number }
    | { type: 'ballSaved'; }
    | { type: 'brickHit'; x: number; y: number; destroyed: boolean; points: number }
    | { type: 'dropSpawned'; x: number; y: number; kind: PowerUpKind }
    | { type: 'powerUpCollected'; kind: PowerUpKind }
    | { type: 'paddleHit'; }
    | { type: 'roundEnded'; win: boolean; score: number };

/** Read-only view of the world handed to the renderer each frame (world units). */
export interface WorldSnapshot {
    width: number;
    height: number;
    shieldY: number;
    paddle: Rect;
    balls: readonly { x: number; y: number; r: number }[];
    bricks: readonly { x: number; y: number; w: number; h: number; hp: number; maxHp: number; kind: BrickKind }[];
    drops: readonly { x: number; y: number; kind: PowerUpKind }[];
    shieldActive: boolean;
    lives: number;
    score: number;
    wave: number;
    combo: number;
    phase: RoundPhase;
    timerSeconds: number;
    fireball: boolean;
}
