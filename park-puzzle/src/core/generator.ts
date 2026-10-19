import { CAR_COLORS } from './config.ts';
import type { LevelSpec } from './config.ts';
import { DIRECTIONS, directionVector } from './ring.ts';
import type { Direction } from './ring.ts';
import type { CarSpec } from './world.ts';
import type { RandomPort } from './ports.ts';

/**
 * Seeded, procedural level generation.
 *
 * There are no level files to ship: a level is built in REVERSE exit order, which makes a
 * solvable exit order fall out by construction.
 *
 * Cars are placed one at a time, and each new car must be able to drive straight out with
 * every car placed SO FAR still on the board. The cars placed later are exactly the ones
 * that will have left by the time this one goes, so leaving them out of the check is
 * correct — and the reverse of the placement order is always a working exit order. That
 * is the whole proof; no solver pass is needed afterwards.
 *
 * Randomness is injected, so a seed reproduces a level exactly.
 */
export function generateLevel(spec: LevelSpec, random: RandomPort): CarSpec[] {
    const target = pickCount(spec, random);
    let best = buildLevel(spec, random, target);

    // Every band parks two-cell cars, and a two-cell body cannot slip into a one-cell
    // gap, so a single pass can seal the last usable corridors and stall below `minCars`
    // no matter how long it searches — more attempts do not help, because the packing
    // itself is the dead end rather than the effort spent on it. Re-running the same
    // construction on the next stretch of the seeded stream is safe: each pass places its
    // cars against only the cars it placed itself, so the reverse-exit proof holds for
    // whichever pass is kept, and the fullest result is the one that ships.
    for (let retry = 0; retry < 8 && best.length < spec.minCars; retry++) {
        const candidate = buildLevel(spec, random, target);
        if (candidate.length > best.length) best = candidate;
    }

    return best;
}

/** One pass of the reverse-exit construction, stopping at `target` cars. */
function buildLevel(spec: LevelSpec, random: RandomPort, target: number): CarSpec[] {
    const cars: CarSpec[] = [];

    for (let attempt = 0; attempt < 600 && cars.length < target; attempt++) {
        const candidate = pickCandidate(spec, cars, random);
        if (!candidate) continue;
        cars.push(candidate);
    }

    return cars;
}

function pickCount(spec: LevelSpec, random: RandomPort): number {
    const span = spec.maxCars - spec.minCars + 1;
    return spec.minCars + Math.floor(random() * span);
}

/**
 * One placement, or null when the lot is full enough that nothing fits.
 *
 * Several random candidates are sampled and the most BLOCKING one wins: a car that sits
 * across someone else's exit path makes the order puzzle sharper, which is the point of
 * the game. A little noise keeps the levels from being deterministic.
 */
function pickCandidate(spec: LevelSpec, placed: readonly CarSpec[], random: RandomPort): CarSpec | null {
    const samples = 12;
    let best: CarSpec | null = null;
    let bestScore = -1;

    for (let i = 0; i < samples; i++) {
        const candidate = randomPlacement(spec, placed, random);
        if (!candidate) continue;

        const score = blockingScore(candidate, placed) + random() * 0.5;
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return best;
}

function randomPlacement(spec: LevelSpec, placed: readonly CarSpec[], random: RandomPort): CarSpec | null {
    const dir = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
    const length = spec.minLength + Math.floor(random() * (spec.maxLength - spec.minLength + 1));

    // The nose cell is the constraint: the body trails behind it and must stay in the lot.
    const col = Math.floor(random() * spec.cols);
    const row = Math.floor(random() * spec.rows);

    if (!bodyFits(spec, col, row, dir, length)) return null;
    if (bodyBlocked(placed, col, row, dir, length)) return null;
    if (!pathIsClear(spec, col, row, dir, placed)) return null;

    return {
        col,
        row,
        dir,
        length,
        color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
    };
}

/** The whole car, nose to tail, must sit inside the lot on free cells. */
function bodyFits(spec: LevelSpec, col: number, row: number, dir: Direction, length: number): boolean {
    const { dx, dy } = directionVector(dir);

    for (let k = 0; k < length; k++) {
        const x = col - dx * k;
        const y = row - dy * k;
        if (x < 0 || x >= spec.cols || y < 0 || y >= spec.rows) return false;
    }

    return true;
}

/** The cells the new body would sit on must be free; the path check only looks forward. */
function bodyBlocked(
    placed: readonly CarSpec[],
    col: number,
    row: number,
    dir: Direction,
    length: number,
): boolean {
    return bodyCells({ col, row, dir, length }).some((cell) => occupied(placed, cell.x, cell.y));
}

/** No already-placed car may sit between the nose and the edge of the lot. */
function pathIsClear(
    spec: LevelSpec,
    col: number,
    row: number,
    dir: Direction,
    placed: readonly CarSpec[],
): boolean {
    const { dx, dy } = directionVector(dir);
    const steps = dir === 'up' || dir === 'down' ? spec.rows : spec.cols;

    for (let step = 1; step <= steps; step++) {
        const x = col + dx * step;
        const y = row + dy * step;
        if (x < 0 || x >= spec.cols || y < 0 || y >= spec.rows) return true;
        if (occupied(placed, x, y)) return false;
    }

    return true;
}

/** How many placed cars this candidate would park in front of. */
function blockingScore(candidate: CarSpec, placed: readonly CarSpec[]): number {
    let score = 0;

    for (const other of placed) {
        if (!blocks(candidate, other)) continue;
        // Blocking a car that is itself long, or one close to the edge, is worth more:
        // those are the ones the player is most likely to need early.
        score += 1 + other.length * 0.2;
    }

    return score;
}

/** True when `blocker`'s body crosses `target`'s straight exit path. */
function blocks(blocker: CarSpec, target: CarSpec): boolean {
    const { dx, dy } = directionVector(target.dir);
    const blockerCells = bodyCells(blocker);
    // Far enough to reach any edge from any lot in the level table.
    const steps = 12;

    for (let step = 1; step <= steps; step++) {
        const x = target.col + dx * step;
        const y = target.row + dy * step;
        if (blockerCells.some((cell) => cell.x === x && cell.y === y)) return true;
    }

    return false;
}

function bodyCells(car: Pick<CarSpec, 'col' | 'row' | 'dir' | 'length'>): { x: number; y: number }[] {
    const { dx, dy } = directionVector(car.dir);
    const cells: { x: number; y: number }[] = [];
    for (let k = 0; k < car.length; k++) cells.push({ x: car.col - dx * k, y: car.row - dy * k });
    return cells;
}

function occupied(placed: readonly CarSpec[], x: number, y: number): boolean {
    return placed.some((car) => bodyCells(car).some((cell) => cell.x === x && cell.y === y));
}
