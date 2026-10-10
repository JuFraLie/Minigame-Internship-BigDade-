// game.ts — the game controller: the ONLY place that decides what happens next.
// Owns the run state machine and the rules; draws no pixels and touches no DOM.
//
// Side effects leave through ports (GameAudio / GameBridge) and raw player
// input arrives through ActionSource / PointerSource, so this class can be
// driven (and tested) with plain values.

import { HEALTH, LAYOUT, PICKUPS, RULES, SCORING } from '../config/gameConfig.ts';
import type {
  ActionSource,
  GameState,
  Layout,
  Point,
  PointerSource,
  TrapPreview,
} from '../core/types.ts';
import { hitTest, resultButtons } from '../core/uiLayout.ts';
import { Boss } from './boss.ts';
import { collectPickups, hitsObstacle } from './collision.ts';
import { Knight } from './knight.ts';
import { ObstacleSpawner, trapPreview, type Obstacle } from './obstacles.ts';
import { PickupSpawner } from './pickups.ts';
import { milestoneFor, scrollSpeed } from './scoring.ts';

/** Port: everything the game needs from the audio layer. */
export interface GameAudio {
  jump(): void;
  shield(): void;
  death(): void;
  milestone(): void;
  coin(): void;
  heart(): void;
  hurt(): void;
}

/**
 * Port: everything the game needs from the host application (embedded shell).
 * Implemented by `services/hostBridge.ts`, which adapts it to `services/jsbridge.ts`.
 *
 * The controller only expresses intent ("a round starts", "the panel is up");
 * the once-only guarantees of AGENTS.md §4.2 are enforced by the adapter.
 */
export interface GameBridge {
  /** Exactly once per session, on the first Play press. */
  launch(): void;
  /** At every round start, including every Retry. */
  startRound(): void;
  /** When the Result Panel appears. Endless games report `win: true`. */
  endRound(win: boolean, score: number): void;
  /** The Exit button on the Result Panel; at most once per session. */
  exit(win: boolean, score: number): void;
}

export class Game {
  state: GameState = 'start';
  score = 0;
  hiScore = 0; // session best — not persisted, resets each launch
  isNewHi = false;

  hearts: number = HEALTH.START_HEARTS;
  maxHearts: number = HEALTH.MAX_HEARTS;
  /** Coins banked this run — the live counter next to the hearts (HUD). */
  coins = 0;
  /** Coins since the last heart; holds the milestone until one can be used. */
  coinsSinceHeart = 0;
  /** Coins needed for the next heart offer; grows after every heart spawned. */
  coinsForNextHeart: number = PICKUPS.HEART_BASE_COIN_THRESHOLD;

  knight: Knight;
  spawner: ObstacleSpawner;
  pickupSpawner: PickupSpawner;
  /** The chaser running behind the knight — decoration only (see boss.ts). */
  boss: Boss;

  /** Parallax speed in px/s; 0 freezes the background (e.g. on game over). */
  viewSpeed: number = LAYOUT.TITLE_SCROLL_SPEED;
  /** Raw title-screen pulse phase; the renderer turns it into sin(). */
  titlePulse = 0;
  /** Bumped on every new run so views can rebuild run-scoped visuals. */
  runId = 0;

  private readonly layout: Layout;
  private readonly audio: GameAudio;
  private readonly bridge: GameBridge;

  private prevMilestone = 0;
  /** Seconds since the current run started — the confirming tap is not a jump. */
  private runAge = 0;
  private launchSent = false;
  private resultReported = false;

  constructor(layout: Layout, audio: GameAudio, bridge: GameBridge) {
    this.layout = layout;
    this.audio = audio;
    this.bridge = bridge;
    this.knight = new Knight(layout.knightX(), layout.floorY(), layout.gameH);
    this.spawner = new ObstacleSpawner();
    this.pickupSpawner = new PickupSpawner();
    this.boss = new Boss(layout.floorY() - layout.ceilY(), this.knight.heelX);
  }

  /** Height of the corridor the knight and the chaser run through. */
  private corridor(): number {
    return this.layout.floorY() - this.layout.ceilY();
  }

  /** Any tap on the Play Screen — starts the run (AGENTS.md §2). */
  handleAnyInput(): void {
    if (this.state === 'start') this.startRun(true);
  }

  /** Play pressed (button or tap-anywhere): `launch` fires exactly once per
   *  session, then the first round starts (§4.2). Phaser scenes drive this
   *  through the pointer feed; tests may call handleAnyInput directly. */
  handlePlay(): void {
    this.handleAnyInput();
  }

  /** The Result Panel just appeared → finalize and report the round.
   *  Endless game, so `win` is always true (§4.2). Safe to call twice: die()
   *  already reported, and the host adapter guards duplicates anyway. */
  reportResult(): void {
    if (this.state !== 'dead' || this.resultReported) return;
    this.resultReported = true;
    this.bridge.endRound(true, Math.floor(this.score));
  }

  update(dt: number, actions: ActionSource, pointer: PointerSource): void {
    // Drain taps every frame so a stale tap can never fire a button later.
    const tap = pointer.consume();

    if (this.state === 'start') {
      this.titlePulse = (this.titlePulse + dt * 2) % (Math.PI * 2);
      this.viewSpeed = LAYOUT.TITLE_SCROLL_SPEED;
      this.boss.update(dt, {
        heelX: this.knight.heelX,
        worldSpeed: this.viewSpeed,
        progress: 0,
        caught: false,
      });
      // Tapping anywhere on the Play Screen starts the game (§2). The Phaser
      // scenes forward pointer releases here; the direct handleAnyInput path
      // above stays for tests and for press-down responsiveness.
      if (tap) this.handleAnyInput();
      return;
    }

    if (this.state === 'dead') {
      this.viewSpeed = 0;
      this.spawner.advanceAnimations(dt); // bats keep flapping behind the panel
      this.pickupSpawner.advanceAnimations(dt); // …coins keep spinning too
      // …and the chaser creeps up to the fallen knight (decoration only).
      this.boss.update(dt, { heelX: this.knight.heelX, worldSpeed: 0, progress: 0, caught: true });
      if (tap) this.handleResultTap(tap);
      return;
    }

    this.play(dt, actions);
  }

  private play(dt: number, actions: ActionSource): void {
    const floorY = this.layout.floorY();
    this.runAge += dt;

    // Score ≈ distance travelled, like dino run.
    this.score += dt * SCORING.POINTS_PER_SECOND;

    const milestone = milestoneFor(this.score);
    if (milestone > this.prevMilestone && milestone > 0) {
      this.prevMilestone = milestone;
      this.audio.milestone();
      this.boss.lunge(); // the chaser surges forward on every milestone
    }

    this.viewSpeed = scrollSpeed(this.score);
    const progress = Math.min(
      1,
      Math.max(
        0,
        (this.viewSpeed - SCORING.BASE_SPEED) / (SCORING.MAX_SPEED - SCORING.BASE_SPEED),
      ),
    );
    this.boss.update(dt, {
      heelX: this.knight.heelX,
      worldSpeed: this.viewSpeed,
      progress,
      caught: false,
    });
    this.spawner.scroll(this.viewSpeed, dt);
    const spawned = this.spawner.update(dt, this.score, this.layout.gameW, floorY);

    // Pickups ride along with the world; the clock only decides WHEN a pattern
    // is offered, never how hard the run is (see PICKUPS). WHERE it lands is
    // the trap's business: a pattern is laid out in the lane that clears the
    // trap the timeline just rolled, so coins and trap are never a coincidence.
    this.pickupSpawner.scroll(this.viewSpeed, dt);
    this.pickupSpawner.update(
      dt,
      this.layout.gameW,
      floorY,
      this.trapForPickups(spawned, floorY),
      this.spawner.serving,
    );

    // The tap that confirmed Play/Retry is swallowed instead of becoming a jump.
    const action = actions.consume();
    if (this.runAge >= RULES.START_INPUT_DELAY) {
      if (action === 'jump' && this.knight.jump()) this.audio.jump();
      else if (action === 'slide' && this.knight.shield()) this.audio.shield();
    }

    this.knight.groundY = floorY;
    this.knight.update(dt);

    // Coins and hearts the knight just walked into pay out here.
    this.handlePickups();

    // Check obstacle collision
    if (hitsObstacle(this.knight, this.spawner.obstacles, floorY)) {
      if (!this.knight.isInvulnerable) {
        this.hearts--;
        if (this.hearts <= 0) {
          this.die();
        } else {
          this.knight.hurt(HEALTH.HURT_INVULNERABILITY_DURATION);
          this.audio.hurt();
        }
      }
    }
  }

  /**
   * The trap this frame's coin pattern may belong to: one of the traps the
   * timeline JUST rolled — the only ones guaranteed to still be past the right
   * edge (obstacles are born at the warning distance, see obstacles.ts), so a
   * pattern is always born off screen and never pops in mid-corridor.
   *
   * The obstacle leaves here as the neutral TrapPreview contract, so the
   * pickup layer never sees an obstacle at all (§4.3).
   */
  private trapForPickups(spawned: readonly Obstacle[], floorY: number): TrapPreview | null {
    const next = spawned.find(obs => obs.x >= this.layout.gameW);
    return next === undefined ? null : trapPreview(next, floorY);
  }

  /**
   * Prices whatever the knight just walked into: a coin pays bonus score and
   * counts towards the next heart, a heart restores exactly one HP and never
   * overshoots the maximum.
   *
   * The heart milestone WAITS at full health — a heart is only offered while
   * one is actually missing, so a wasted heart can never be spawned and the
   * first coin after a hit drops the promised one.
   */
  private handlePickups(): void {
    const { coins, hearts } = collectPickups(this.knight, this.pickupSpawner.pickups);
    if (coins.length === 0 && hearts.length === 0) return;

    // Hearts first: a heart grabbed this very frame already fills the row, so
    // the coin milestone below sees the real state and offers nothing extra.
    if (hearts.length > 0) {
      for (let i = 0; i < hearts.length; i++) this.audio.heart();
      this.hearts = Math.min(this.maxHearts, this.hearts + hearts.length);
    }

    this.score += coins.length * PICKUPS.COIN_POINTS;
    this.coins += coins.length;
    this.coinsSinceHeart += coins.length;
    for (let i = 0; i < coins.length; i++) this.audio.coin();

    if (this.coinsSinceHeart >= this.coinsForNextHeart && this.hearts < this.maxHearts) {
      this.pickupSpawner.spawnHeart(this.layout.gameW, this.layout.floorY());
      this.coinsSinceHeart = 0;
      this.coinsForNextHeart += PICKUPS.HEART_COIN_THRESHOLD_INCREMENT;
    }
  }

  private die(): void {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.viewSpeed = 0;
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.isNewHi = true;
    }
    this.audio.death();
    // Endless run → win: true (AGENTS.md §4.2). Reported when the panel appears.
    this.resultReported = true;
    this.bridge.endRound(true, Math.floor(this.score));
  }

  /**
   * @param fromPlayScreen true only when the run follows the Play Screen, so
   *   `launch` fires exactly once, on the very first Play press.
   */
  private startRun(fromPlayScreen: boolean): void {
    if (fromPlayScreen && !this.launchSent) {
      this.launchSent = true;
      this.bridge.launch();
    }

    this.state = 'playing';
    this.score = 0;
    this.prevMilestone = 0;
    this.isNewHi = false;
    this.resultReported = false;
    this.hearts = HEALTH.START_HEARTS;
    this.maxHearts = HEALTH.MAX_HEARTS;
    this.coins = 0;
    this.coinsSinceHeart = 0;
    this.coinsForNextHeart = PICKUPS.HEART_BASE_COIN_THRESHOLD;
    this.runId++;
    this.runAge = 0;
    this.knight = new Knight(this.layout.knightX(), this.layout.floorY(), this.layout.gameH);
    this.spawner = new ObstacleSpawner();
    this.pickupSpawner = new PickupSpawner();
    this.boss = new Boss(this.corridor(), this.knight.heelX); // fresh chaser, far behind

    this.bridge.startRound();
  }

  /** Result Panel only: Retry goes straight back to gameplay (AGENTS.md §2). */
  private restart(): void {
    this.startRun(false);
  }

  private handleResultTap(tap: Point): void {
    const { restart, exit } = resultButtons(this.layout.gameW, this.layout.gameH);
    if (hitTest(restart, tap.x, tap.y)) this.restart();
    else if (hitTest(exit, tap.x, tap.y)) this.bridge.exit(true, Math.floor(this.score));
  }
}

