import { type Board, type BoardSize, GRID_4, GRID_6, cellIndex, countOf, withPlacement } from './Board.ts';
import { generatePuzzle, mulberry32 } from './PuzzleGenerator.ts';
import { canPlace, completedLinesAfter, isBoardComplete } from './Rules.ts';
import { DEFAULT_SCORING, type ScoringConfig, ScoreLedger } from './Scoring.ts';
import type { ClockPort, EventsOutPort, GameCommand, RoundPhase, RoundSnapshot } from './ports.ts';
import type { ShapeId } from './shapes.ts';

/**
 * One round of Shape Sudoku: the board, the hearts left, and the running score.
 *
 * This is the whole game in a single pure object. It accepts commands that already carry
 * puzzle coordinates and emits events; it owns no sprites, no timers and no DOM, so the
 * exact same class drives the real game, the unit tests and the headless benchmark.
 */
export interface RoundConfig {
    readonly level: number;
    readonly grid: BoardSize;
    /** Cells the player is left with at the start. */
    readonly givenCount: number;
    readonly hearts: number;
    /** Seconds the player is expected to need; finishing sooner earns a time bonus. */
    readonly parSeconds: number;
    readonly scoring: ScoringConfig;
}

/**
 * Difficulty ramp.
 *
 * Levels 1-3 teach the rules on 4×4, easing from 8 givens down to 6. Levels 4-7 switch to
 * the full 6×6 shape family and run 18 → 14. Level 8 keeps thinning toward a floor of 10,
 * one given every other level, so the game gets harder without ever becoming unfair.
 */
function givenCountForLevel(level: number): number {
    if (level <= 3) return 8 - (level - 1);
    if (level <= 7) return 18 - (level - 4);
    return Math.max(10, 14 - Math.floor((level - 8) / 2));
}

export function gridForLevel(level: number): BoardSize {
    return level <= 3 ? GRID_4 : GRID_6;
}

export function configForLevel(level: number): RoundConfig {
    const grid = gridForLevel(level);
    return {
        level,
        grid,
        givenCount: givenCountForLevel(level),
        hearts: 3,
        parSeconds: grid === GRID_4 ? 90 : 180,
        scoring: DEFAULT_SCORING,
    };
}

export class RoundState {
    readonly #config: RoundConfig;
    readonly #clock: ClockPort;
    readonly #events: EventsOutPort;
    readonly #ledger: ScoreLedger;
    readonly #startedAt: number;

    #board: Board;
    #hearts: number;
    #selected: number | null = null;
    #phase: RoundPhase = 'playing';

    constructor(
        config: RoundConfig,
        board: Board,
        clock: ClockPort,
        events: EventsOutPort,
        startedAt: number = clock.now(),
    ) {
        this.#config = config;
        this.#board = board;
        this.#clock = clock;
        this.#events = events;
        this.#ledger = new ScoreLedger(config.scoring);
        this.#hearts = config.hearts;
        this.#startedAt = startedAt;
    }

    /**
     * Builds a round for a level from a seed.
     *
     * Reusing a level's seed reproduces its puzzle exactly, which is what makes Retry a
     * genuine second attempt at the same board rather than a new one.
     */
    static create(level: number, seed: number, clock: ClockPort, events: EventsOutPort): RoundState {
        const config = configForLevel(level);
        const board = generatePuzzle({
            size: config.grid,
            givenCount: config.givenCount,
            random: mulberry32(seed),
        });
        return new RoundState(config, board, clock, events);
    }

    get board(): Board {
        return this.#board;
    }

    get phase(): RoundPhase {
        return this.#phase;
    }

    get hearts(): number {
        return this.#hearts;
    }

    get score(): number {
        return this.#ledger.score;
    }

    /** Seconds since the round started, rounded down. */
    elapsedSeconds(): number {
        return Math.max(0, (this.#clock.now() - this.#startedAt) / 1000);
    }

    /** Applies one player command. Commands arriving after the round ended are ignored. */
    handle(command: GameCommand): void {
        if (this.#phase !== 'playing') return;
        if (command.kind === 'selectCell') this.#select(command.row, command.col);
        else this.#pick(command.shape);
    }

    /** Everything a renderer or a test needs to draw the round right now. */
    snapshot(): RoundSnapshot {
        const shapeCount = this.#config.grid.size;
        const tray: number[] = [];
        for (let shape = 0; shape < shapeCount; shape++) tray.push(shapeCount - countOf(this.#board, shape));

        return {
            board: this.#board,
            phase: this.#phase,
            hearts: this.#hearts,
            maxHearts: this.#config.hearts,
            score: this.#ledger.score,
            streak: this.#ledger.streak,
            multiplier: this.#ledger.multiplier,
            level: this.#config.level,
            selected: this.#selected,
            tray,
            parSeconds: this.#config.parSeconds,
            secondsLeft: Math.max(0, this.#config.parSeconds - this.elapsedSeconds()),
        };
    }

    #select(row: number, col: number): void {
        const n = this.#config.grid.size;
        if (row < 0 || col < 0 || row >= n || col >= n) return;

        const index = cellIndex(n, row, col);
        // Givens and already-placed shapes are locked, so tapping them changes nothing.
        if (this.#board.cells[index] !== null) return;

        this.#selected = index;
        this.#events.emit({ type: 'selected', index });
    }

    #pick(shape: ShapeId): void {
        const selected = this.#selected;
        if (selected === null) return;

        const n = this.#config.grid.size;
        const row = Math.floor(selected / n);
        const col = selected % n;

        // `canPlace` refuses both a collision and a pick that would strand the puzzle, so
        // a round can only ever move toward a board it is still able to finish.
        if (!canPlace(this.#board, row, col, shape)) {
            const penalty = this.#ledger.recordWrong();
            this.#hearts -= 1;
            this.#events.emit({
                type: 'wrong',
                index: selected,
                shape,
                penalty,
                score: this.#ledger.score,
                hearts: this.#hearts,
            });
            // The cell stays selected: the shape popped back out, so the player can
            // simply pick a different one without retapping the board.
            if (this.#hearts <= 0) this.#finish(false);
            return;
        }

        this.#board = withPlacement(this.#board, row, col, shape);
        this.#selected = null;

        const { gained, multiplier } = this.#ledger.recordCorrect();
        this.#events.emit({ type: 'correct', index: selected, shape, gained, multiplier, score: this.#ledger.score });

        const lines = completedLinesAfter(this.#board, row, col);
        if (lines.length > 0) {
            const bonus = this.#ledger.recordLineBonus(lines.length);
            this.#events.emit({ type: 'linesCompleted', lines, bonus, score: this.#ledger.score });
        }

        if (isBoardComplete(this.#board)) this.#finish(true);
    }

    #finish(win: boolean): void {
        if (this.#phase !== 'playing') return;

        if (win) {
            const bonus = this.#ledger.recordTimeBonus(this.#config.parSeconds - this.elapsedSeconds());
            this.#events.emit({ type: 'timeBonus', bonus, score: this.#ledger.score });
        }

        this.#phase = win ? 'won' : 'lost';
        this.#events.emit({ type: win ? 'won' : 'lost', score: this.#ledger.score });
    }
}
