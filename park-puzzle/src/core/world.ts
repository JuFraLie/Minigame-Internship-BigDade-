import {
    BUS_COLOR,
    BUS_LENGTH,
    BUS_SPEED_RATIO,
    ENTRY_WINDOW_MIN_CELLS,
    PULSE_AMPLITUDE,
    PULSE_PERIOD_SECONDS,
    QUEUE_GAP_CELLS,
    SHAKE_SECONDS,
    SPEED_BONUS_PAR_SECONDS_PER_CAR,
    TICK_SECONDS,
    levelSpec,
} from './config.ts';
import type { LevelSpec } from './config.ts';
import { directionVector, entryCellIndex, mod, ringLength } from './ring.ts';
import type { Direction } from './ring.ts';
import { ScoreState } from './scoring.ts';
import { generateLevel } from './generator.ts';
import type { RandomPort, RoundEvent, RoundEventsPort } from './ports.ts';

/**
 * The simulation: a lot, a ring road, and the rules that tie them together.
 *
 * Pure TypeScript in lot-space (integer cells and fractional ring positions) on a fixed
 * tick. It knows nothing about pixels, Phaser or the DOM, so a whole round can be played
 * out headless in a test or a benchmark (AGENTS.md §4.3).
 *
 * States a car moves through:
 *
 *   parked ──tap, path clear──▶ leaving ──entry window free──▶ circling ──one lap──▶ gone
 *      ▲                          │
 *      └──tap, path blocked──┘   └──entry window blocked: crash, bounce back, -1 fender
 */

/** A car as the generator hands it over: nose cell, direction, length, colour. */
export interface CarSpec {
    col: number;
    row: number;
    dir: Direction;
    length: number;
    color: number;
}

export interface ParkedCar extends CarSpec {
    readonly id: number;
    /** Until when (round seconds) a blocked tap keeps shaking and showing the lock. */
    blockedUntil: number;
}

/** A car driving out of — or bouncing back into — the lot. `progress` is in cells. */
export interface LeavingCar {
    readonly id: number;
    readonly col: number;
    readonly row: number;
    readonly dir: Direction;
    readonly length: number;
    readonly color: number;
    /** Cells travelled from the parked nose position toward the entry cell. */
    progress: number;
    /** Cells it must cover to reach the entry cell. */
    readonly distance: number;
    /** Out, or bouncing back to the parking spot after a crash. */
    outward: boolean;
}

/** A car on the ring. `pos` is the continuous position of its nose, in cells from index 0. */
export interface RingCar {
    readonly id: number;
    pos: number;
    readonly length: number;
    readonly color: number;
    /** Ring cell it joined at, so it can leave again there after one lap. */
    readonly entry: number;
    readonly isBus: boolean;
}

/** Read-only projection of a car for the renderer. */
export interface ParkedCarView extends Readonly<CarSpec> {
    readonly id: number;
    readonly blocked: boolean;
}

export interface LeavingCarView {
    readonly id: number;
    /** Continuous nose position in lot space. */
    readonly x: number;
    readonly y: number;
    readonly dir: Direction;
    readonly length: number;
    readonly color: number;
}

export interface RingCarView {
    readonly id: number;
    /** Continuous nose position on the ring, in cells from index 0. */
    readonly pos: number;
    readonly length: number;
    readonly color: number;
}

/** An entry point with its window, so the renderer can pulse the gap for the player. */
export interface EntryWindowView {
    /** Ring cells the joining car needs: the entry cell and the cells just upstream. */
    readonly cells: number[];
    /** How many of `cells` are currently occupied — 0 means "safe to release now". */
    readonly occupied: number;
}

/** Everything the renderer is allowed to see. */
export interface WorldSnapshot {
    readonly cols: number;
    readonly rows: number;
    readonly ringCells: number;
    readonly parked: readonly ParkedCarView[];
    readonly leaving: readonly LeavingCarView[];
    readonly ring: readonly RingCarView[];
    readonly entries: readonly EntryWindowView[];
    readonly score: number;
    readonly lives: number;
    readonly multiplier: number;
    readonly totalCars: number;
    readonly elapsed: number;
    readonly phase: RoundPhase;
    /** True while the level's bus is still circling. */
    readonly busActive: boolean;
}

export type RoundPhase = 'playing' | 'won' | 'lost';

/**
 * One round of Ring Road Parking.
 *
 * Constructed with an injectable random so a level is reproducible, and driven only by
 * `tick()` — it owns no timer of its own.
 */
export class GameWorld {
    readonly cols: number;
    readonly rows: number;
    readonly ringCells: number;
    readonly spec: LevelSpec;

    readonly parked: ParkedCar[] = [];
    readonly leaving: LeavingCar[] = [];
    readonly ring: RingCar[] = [];

    readonly scoreState = new ScoreState();

    phase: RoundPhase = 'playing';
    elapsed = 0;

    private readonly listeners: RoundEventsPort[] = [];
    private nextId = 1;
    private totalCars = 0;
    private busId: number | null = null;

    constructor(random: RandomPort, level = 1) {
        this.spec = levelSpec(level);
        this.cols = this.spec.cols;
        this.rows = this.spec.rows;
        this.ringCells = ringLength(this.cols, this.rows);
        this.load(generateLevel(this.spec, random));
    }

    /** Replaces the lot with a known set of cars. Used by the constructor and by tests. */
    load(cars: readonly CarSpec[]): void {
        this.parked.length = 0;
        this.leaving.length = 0;
        this.ring.length = 0;
        this.busId = null;
        this.phase = 'playing';
        this.elapsed = 0;
        this.nextId = 1;
        // A reused world must not carry the previous round's score, fenders or combo —
        // a stale `lastReleaseAt` would chain a multiplier straight into the new round.
        this.scoreState.reset();

        for (const spec of cars) {
            this.parked.push({ ...spec, id: this.nextId++, blockedUntil: 0 });
        }
        this.totalCars = this.parked.length;

        if (this.spec.bus) this.spawnBus();
    }

    subscribe(listener: RoundEventsPort): () => void {
        this.listeners.push(listener);
        return () => {
            const at = this.listeners.indexOf(listener);
            if (at >= 0) this.listeners.splice(at, 1);
        };
    }

    private emit(event: RoundEvent): void {
        for (const listener of this.listeners) listener(event);
    }

    /** Ring speed for the current moment, in cells per second. */
    get speed(): number {
        if (!this.spec.speedPulse) return this.spec.ringSpeed;
        const wave = Math.sin((this.elapsed * 2 * Math.PI) / PULSE_PERIOD_SECONDS);
        return this.spec.ringSpeed * (1 + PULSE_AMPLITUDE * wave);
    }

    /**
     * The tap handler. Grid coordinates, straight from the input adapter.
     *
     * A car whose path is blocked only shakes: no penalty, the player just picked the
     * wrong moment or the wrong car. A clear path commits the car to the exit.
     */
    tapCell(col: number, row: number): void {
        if (this.phase !== 'playing') return;

        const car = this.parkedAt(col, row);
        if (!car) return;

        if (!this.pathIsClear(car)) {
            car.blockedUntil = this.elapsed + SHAKE_SECONDS;
            this.emit({ type: 'carBlocked', id: car.id });
            return;
        }

        const at = this.parked.indexOf(car);
        this.parked.splice(at, 1);
        this.leaving.push({
            id: car.id,
            col: car.col,
            row: car.row,
            dir: car.dir,
            length: car.length,
            color: car.color,
            progress: 0,
            distance: this.distanceToEntry(car),
            outward: true,
        });
        this.emit({ type: 'carReleased', id: car.id });
    }

    /** Advances the simulation by one fixed tick. */
    tick(): void {
        if (this.phase !== 'playing') return;

        this.elapsed += TICK_SECONDS;
        this.advanceRing();
        this.advanceLeaving();
        this.checkEnd();
    }

    // ---- ring -------------------------------------------------------------------

    private advanceRing(): void {
        const dt = TICK_SECONDS;
        const speed = this.speed;

        for (const car of this.ring) {
            car.pos += (car.isBus ? speed * BUS_SPEED_RATIO : speed) * dt;
        }

        this.queueBehind();
        this.dropFinishedLaps();
    }

    /**
     * Keeps faster cars from driving through the vehicle in front of them.
     *
     * This is what makes the bus clog the ring: cars released behind it bunch up instead
     * of clipping through, and the player can see the jam building.
     *
     * The neighbour ahead is found by modular gap rather than by sorting positions:
     * positions are unwrapped (each car counts from its own entry), so a car that joined
     * late can hold a smaller number than one that is already half a lap away.
     */
    private queueBehind(): void {
        for (const car of this.ring) {
            const ahead = this.nearestAhead(car);
            if (!ahead) continue;

            // The leader's TAIL is `pos - (length - 1)`, the same cell span the occupancy
            // check and the renderer use; measuring from one cell further back would hold
            // every queued car a full empty cell behind the one in front of it.
            const gap = mod(ahead.pos - (ahead.length - 1) - car.pos, this.ringCells);
            if (gap >= QUEUE_GAP_CELLS) continue;

            car.pos -= QUEUE_GAP_CELLS - gap;
        }
    }

    /** The car whose tail is the smallest positive distance ahead of `car` on the ring. */
    private nearestAhead(car: RingCar): RingCar | null {
        let best: RingCar | null = null;
        let bestGap = Number.POSITIVE_INFINITY;

        for (const other of this.ring) {
            if (other === car) continue;
            const gap = mod(other.pos - (other.length - 1) - car.pos, this.ringCells);
            if (gap > 0 && gap < bestGap) {
                bestGap = gap;
                best = other;
            }
        }

        return best;
    }

    /** A car that has travelled one full lap leaves the ring at its own entry cell. */
    private dropFinishedLaps(): void {
        for (let i = this.ring.length - 1; i >= 0; i--) {
            const car = this.ring[i];
            const travelled = car.pos - car.entry;
            if (travelled >= this.ringCells) this.ring.splice(i, 1);
        }
    }

    private spawnBus(): void {
        const id = this.nextId++;
        this.busId = id;
        this.ring.push({
            id,
            pos: 0,
            length: BUS_LENGTH,
            color: BUS_COLOR,
            entry: 0,
            isBus: true,
        });
    }

    // ---- leaving ----------------------------------------------------------------

    private advanceLeaving(): void {
        const dt = TICK_SECONDS;

        for (let i = this.leaving.length - 1; i >= 0; i--) {
            const car = this.leaving[i];
            const step = this.speed * dt;

            if (car.outward) {
                car.progress = Math.min(car.distance, car.progress + step);
                if (car.progress >= car.distance) {
                    this.resolveEntry(car, i);
                    // Losing the last fender empties `leaving` outright, so every index
                    // this loop still walks is stale. Carrying on would read `undefined`
                    // and throw inside Phaser's RAF callback, freezing the game for good.
                    if (this.phase !== 'playing') return;
                }
            } else {
                car.progress = Math.max(0, car.progress - step);
                // Bounced all the way back: the car is parked again, in the spot it left.
                if (car.progress <= 0) {
                    this.leaving.splice(i, 1);
                    this.repark(car);
                }
            }
        }
    }

    /**
     * The car has arrived at the entry cell. It joins only when the whole window — the
     * entry cell plus enough upstream cells for its own body — is free, otherwise it
     * crashes: bounce back, lose a fender, combo gone.
     */
    private resolveEntry(car: LeavingCar, index: number): void {
        const entry = entryCellIndex(this.cols, this.rows, car.col, car.row, car.dir);
        const needed = Math.max(ENTRY_WINDOW_MIN_CELLS, car.length);

        if (this.windowIsClear(entry, needed)) {
            this.ring.push({
                id: car.id,
                pos: entry + 0.5,
                length: car.length,
                color: car.color,
                entry,
                isBus: false,
            });
            this.leaving.splice(index, 1);
            this.registerClear(car, entry);
            return;
        }

        car.outward = false;
        this.scoreState.registerCrash();
        this.emit({ type: 'carCrashed', id: car.id, lives: this.scoreState.lives });

        if (this.scoreState.lives <= 0) {
            this.phase = 'lost';
            // `tick()` stops the moment the round is over, so a car caught mid-bounce would
            // be stranded outside the lot forever. Put every moving car back in its spot:
            // the frozen board behind the Result Panel still has to look right.
            for (const stuck of this.leaving) this.repark(stuck);
            this.leaving.length = 0;
            this.emit({ type: 'roundLost' });
        }
    }

    /** A car is back where it started: parked, with no lock left over from an earlier try. */
    private repark(car: LeavingCar): void {
        this.parked.push({
            id: car.id,
            col: car.col,
            row: car.row,
            dir: car.dir,
            length: car.length,
            color: car.color,
            blockedUntil: 0,
        });
    }

    /** +100 x multiplier, and +50 when it joined with a circling car 1-2 cells away. */
    private registerClear(car: LeavingCar, entry: number): void {
        const points = this.scoreState.registerRelease(this.elapsed);
        this.emit({ type: 'carCleared', id: car.id, points, multiplier: this.scoreState.multiplier });

        const gap = this.nearestRingGap(entry, car.id);
        if (gap >= 1 && gap <= 2) {
            const nearMiss = this.scoreState.registerNearMiss();
            this.emit({ type: 'nearMiss', id: car.id, points: nearMiss });
        }
    }

    /**
     * Smallest distance, in cells, from `entry` to any cell of any other ring car.
     * Reported as a positive gap, or a large number when nothing is near.
     */
    private nearestRingGap(entry: number, selfId: number): number {
        let best = Number.POSITIVE_INFINITY;

        for (const other of this.ring) {
            if (other.id === selfId) continue;
            for (let k = 0; k < other.length; k++) {
                const cell = mod(Math.floor(other.pos) - k, this.ringCells);
                const gap = mod(entry - cell, this.ringCells);
                best = Math.min(best, gap, this.ringCells - gap);
            }
        }

        return best;
    }

    // ---- queries ----------------------------------------------------------------

    /** Ring cells `entry, entry-1, ...` that a car of `length` would need to join. */
    entryWindowCells(entry: number, length: number): number[] {
        const needed = Math.max(ENTRY_WINDOW_MIN_CELLS, length);
        const cells: number[] = [];
        for (let k = 0; k < needed; k++) cells.push(mod(entry - k, this.ringCells));
        return cells;
    }

    private windowIsClear(entry: number, needed: number): boolean {
        for (const car of this.ring) {
            for (let k = 0; k < car.length; k++) {
                const cell = mod(Math.floor(car.pos) - k, this.ringCells);
                for (let w = 0; w < needed; w++) {
                    if (cell === mod(entry - w, this.ringCells)) return false;
                }
            }
        }
        return true;
    }

    /**
     * The car at `(col, row)`, wherever on its body the tap landed.
     *
     * `col`/`row` is the car's NOSE, so the rest of it trails behind, against the
     * direction of travel.
     */
    private parkedAt(col: number, row: number): ParkedCar | null {
        for (const car of this.parked) {
            const { dx, dy } = directionVector(car.dir);
            for (let k = 0; k < car.length; k++) {
                if (car.col - dx * k === col && car.row - dy * k === row) return car;
            }
        }
        return null;
    }

    /** True when nothing else sits between the car's nose and the edge of the lot. */
    private pathIsClear(car: ParkedCar): boolean {
        const { dx, dy } = directionVector(car.dir);

        for (let step = 1; step <= this.distanceToEntry(car); step++) {
            const col = car.col + dx * step;
            const row = car.row + dy * step;
            if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
            if (this.parkedAt(col, row)) return false;
        }
        return true;
    }

    /** Cells from the car's nose to the ring cell in front of it. */
    private distanceToEntry(car: ParkedCar): number {
        switch (car.dir) {
            case 'up':
                return car.row + 1;
            case 'down':
                return this.rows - car.row;
            case 'left':
                return car.col + 1;
            case 'right':
                return this.cols - car.col;
        }
    }

    private checkEnd(): void {
        if (this.phase !== 'playing') return;

        if (this.parked.length === 0 && this.leaving.length === 0) {
            const par = this.totalCars * SPEED_BONUS_PAR_SECONDS_PER_CAR;
            const points = this.scoreState.registerClear(this.elapsed, par);
            this.phase = 'won';
            this.emit({ type: 'roundWon', points });
        }
    }

    // ---- snapshot ---------------------------------------------------------------

    /** Read-only projection handed to the renderer. Allocates; called once per frame. */
    snapshot(): WorldSnapshot {
        return {
            cols: this.cols,
            rows: this.rows,
            ringCells: this.ringCells,
            parked: this.parked.map((car) => ({
                id: car.id,
                col: car.col,
                row: car.row,
                dir: car.dir,
                length: car.length,
                color: car.color,
                blocked: car.blockedUntil > this.elapsed,
            })),
            leaving: this.leaving.map((car) => {
                const { dx, dy } = directionVector(car.dir);
                return {
                    id: car.id,
                    x: car.col + dx * car.progress,
                    y: car.row + dy * car.progress,
                    dir: car.dir,
                    length: car.length,
                    color: car.color,
                };
            }),
            ring: this.ring.map((car) => ({
                id: car.id,
                pos: car.pos,
                length: car.length,
                color: car.color,
            })),
            entries: this.entryViews(),
            score: this.scoreState.score,
            lives: this.scoreState.lives,
            multiplier: this.scoreState.multiplier,
            totalCars: this.totalCars,
            elapsed: this.elapsed,
            phase: this.phase,
            busActive: this.busId !== null && this.ring.some((car) => car.isBus),
        };
    }

    /**
     * One window per entry that still has a car waiting behind it, with a live count of
     * how blocked it is. This is the read the whole timing puzzle hangs on.
     */
    private entryViews(): EntryWindowView[] {
        const views: EntryWindowView[] = [];
        const counted = new Set<number>();

        for (const car of this.parked) {
            const entry = entryCellIndex(this.cols, this.rows, car.col, car.row, car.dir);
            if (counted.has(entry)) continue;
            counted.add(entry);

            const cells = this.entryWindowCells(entry, car.length);
            let occupied = 0;
            for (const cell of cells) {
                if (this.ring.some((other) => this.ringCarOccupies(other, cell))) occupied++;
            }

            views.push({ cells, occupied });
        }

        return views;
    }

    private ringCarOccupies(car: RingCar, cell: number): boolean {
        for (let k = 0; k < car.length; k++) {
            if (mod(Math.floor(car.pos) - k, this.ringCells) === cell) return true;
        }
        return false;
    }
}
