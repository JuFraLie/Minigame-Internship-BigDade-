import type { FieldPoint } from '../core/config.ts';
import type { AudioPort, BridgePort, Random } from '../core/ports.ts';
import type { WorldEvent } from '../core/types.ts';
import { GameWorld } from '../core/world.ts';

export interface RoundResult {
    score: number;
    defeated: number;
    maxCombo: number;
    win: boolean;
}

export interface RoundSessionOptions {
    readonly bridge: BridgePort;
    readonly audio: AudioPort;
    /** Optional so tests can inject a deterministic sequence; defaults to `Math.random`. */
    readonly random?: Random;
    /**
     * What `endRound`/`exit` report as `win`.
     *
     * This round has no winning state: it only ends when the player runs out of lives, so
     * it is a score-chase game. AGENTS.md §4.2 requires endless/infinite games to report
     * `win: true`, which is also what the other score-chase games in this repository send.
     */
    readonly reportsWin?: boolean;
}

/**
 * Owns one round: it starts the simulation, feeds it input in field coordinates, turns
 * simulation events into audio and host-bridge signals, and finalises the score exactly
 * once when the round ends.
 *
 * It depends only on the ports above, so it is testable with fakes and never touches a
 * renderer (AGENTS.md §4.3).
 */
export class RoundSession {
    readonly world: GameWorld;

    private readonly bridge: BridgePort;
    private readonly audio: AudioPort;
    private readonly reportsWin: boolean;
    private roundReported = false;

    constructor(options: RoundSessionOptions) {
        this.bridge = options.bridge;
        this.audio = options.audio;
        this.reportsWin = options.reportsWin ?? true;
        this.world = new GameWorld(options.random ?? Math.random);
        this.world.subscribe((event) => this.onWorldEvent(event));
    }

    /** Begins a fresh round and tells the host (`startRound`). */
    startRound(): void {
        this.roundReported = false;
        this.world.reset();
        this.bridge.startRound();
    }

    update(dtSeconds: number): void {
        this.world.update(dtSeconds);
    }

    tapAt(point: FieldPoint): void {
        // First touch of the round: unlocks Web Audio on mobile WebViews.
        this.audio.resume();
        this.world.tap(point);
    }

    swipeAt(from: FieldPoint, to: FieldPoint): void {
        this.world.swipe(from, to);
    }

    get roundOver(): boolean {
        return this.world.phase === 'over';
    }

    /**
     * Signals `endRound` and returns the stats shown on the Result Panel.
     *
     * @returns null while the round is running, or when it has already been finalised.
     */
    finishRound(): RoundResult | null {
        if (this.roundReported || this.world.phase !== 'over') return null;

        this.roundReported = true;
        const result: RoundResult = {
            score: this.world.score,
            defeated: this.world.defeated,
            maxCombo: this.world.maxCombo,
            win: this.reportsWin,
        };
        this.bridge.endRound(result.win, result.score);
        return result;
    }

    private onWorldEvent(event: WorldEvent): void {
        switch (event.type) {
            case 'monsterDefeated':
                if (event.kind === 'armored') this.audio.heavySmash();
                else if (event.kind === 'ninja') this.audio.slash();
                else this.audio.whack();
                break;
            case 'monsterCracked':
                this.audio.armorCrack();
                break;
            case 'monsterDeflected':
                this.audio.deflect();
                break;
            case 'monsterEscaped':
                this.audio.escape();
                break;
            case 'roundOver':
                this.audio.roundOver();
                break;
            default:
                break;
        }
    }
}
