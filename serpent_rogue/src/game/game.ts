// game.ts — The game controller: the central rules engine.
// Strictly decoupled from DOM and canvas via hexagonal ports.
// Can run completely headless in unit tests.

import { FOOD, LEVELING, RULES, SCORING, SNAKE } from '../config/gameConfig.ts';
import type {
  ArenaBounds,
  Cell,
  DirectionSource,
  GameState,
  Layout,
  Point,
  PointerSource,
} from '../core/types.ts';
import { hitTest, resultButtons, upgradeCardLayout } from '../core/uiLayout.ts';
import { arenaFor, type Arena } from './arena.ts';
import { FoodSpawner } from './food.ts';
import { ComboTracker, xpNeededForLevel } from './scoring.ts';
import { Snake } from './snake.ts';
import { StageManager } from './stages.ts';
import {
  getActiveSynergies,
  pickRandomUpgrades,
  type Upgrade,
  type UpgradeState,
} from './upgrades.ts';

export interface GameAudio {
  eat(): void;
  goldenEat(): void;
  levelUp(): void;
  cardPick(): void;
  hurt(): void;
  death(): void;
  rockSmash(): void;
  dash(): void;
  combo(): void;
}

export interface GameBridge {
  launch(): void;
  startRound(): void;
  endRound(win: boolean, score: number): void;
  exit(win: boolean, score: number): void;
}

export class Game implements UpgradeState {
  state: GameState = 'start';
  score = 0;
  hiScore = 0;
  isNewHi = false;

  // Roguelike Progression
  level = 1;
  xp = 0;
  totalFoodEaten = 0;
  stageManager = new StageManager();
  comboTracker = new ComboTracker();

  // Grid & Entities
  snake!: Snake;
  foodSpawner = new FoodSpawner();
  rocks: Cell[] = [];

  // Upgrade State
  tickMs = SNAKE.BASE_INTERVAL * 1000;
  wallWrap = false;
  shedSkinCount = 0;
  magnetRange = 0;
  compactCoil = false;
  comboChain = false;
  goldenChance = FOOD.GOLDEN_CHANCE;
  phaseTailTime = 0;
  doubleFeast = false;
  rockSmasherCount = 0;
  hasDash = false;
  longBoi = false;
  splitTail = false;
  armoredScales = 0;
  venomTrail = false;
  fastFeast = false;
  rerolls = 1;
  guaranteedRareNext = false;
  chosenUpgrades: string[] = [];

  // Active Upgrade Card Choices (during 'upgrading')
  currentChoices: Upgrade[] = [];

  // Dash & Mechanics Timing
  dashCooldownTimer = 0;
  private tickAccumulator = 0;
  private runAge = 0;
  private compactCoilFoodCounter = 0;
  private exitSignalled = false;
  titlePulse = 0;

  private readonly layout: Layout;
  private readonly audio: GameAudio;
  private readonly bridge: GameBridge;

  constructor(layout: Layout, audio: GameAudio, bridge: GameBridge) {
    this.layout = layout;
    this.audio = audio;
    this.bridge = bridge;
    this.resetWorld();
  }

  get snakeLength(): number {
    return this.snake ? this.snake.length : 3;
  }

  shrinkSnake(segments: number): void {
    if (this.snake) {
      this.snake.shrink(segments);
    }
  }

  get xpNeeded(): number {
    return xpNeededForLevel(this.level);
  }

  get activeSynergies(): string[] {
    return getActiveSynergies(this.chosenUpgrades);
  }

  /**
   * The grid and the cell range this stage's walls allow.
   *
   * Single source of truth for "where the game is playable": a contracting
   * stage narrows `bounds`, and movement, wall collisions and every spawn are
   * resolved against the same numbers, so nothing can be born or left behind
   * in the dead zone outside the walls.
   */
  private arena(): Arena {
    return arenaFor(this.layout, this.stageManager.getStageInfo().shrinkInset);
  }

  /**
   * Any tap on the Start Screen launches the game (AGENTS.md §2).
   */
  handleAnyInput(): void {
    if (this.state === 'start') {
      this.startRun(true);
    }
  }

  update(dt: number, dirSource: DirectionSource, pointerSource: PointerSource, dashTriggered = false): void {
    const tap = pointerSource.consume();

    if (this.state === 'start') {
      this.titlePulse = (this.titlePulse + dt * 2) % (Math.PI * 2);
      dirSource.consume(); // A turn has no meaning off the playfield
      if (tap) this.startRun(true);
      return;
    }

    if (this.state === 'upgrading') {
      dirSource.consume(); // ...and neither does one made while picking a card
      if (tap) this.handleCardTap(tap);
      return;
    }

    if (this.state === 'dead') {
      dirSource.consume(); // The round is over: a stray key cannot steer it
      if (tap) this.handleResultTap(tap);
      return;
    }

    // ── Playing State ──────────────────────────────────────────────────────────
    this.runAge += dt;
    this.comboTracker.update(dt);
    this.snake.updateTimers(dt);
    this.foodSpawner.update(dt);
    this.dissolveRocksOnVenom();

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= dt;
    }

    // Direction input
    const dir = dirSource.consume();
    if (dir && this.runAge >= RULES.START_INPUT_DELAY) {
      this.snake.queueDirection(dir);
    }

    // Dash input
    if (dashTriggered && this.hasDash && this.dashCooldownTimer <= 0) {
      this.performDash();
    }

    // Fixed-step simulation tick
    this.tickAccumulator += dt * 1000;
    const currentInterval = this.computeCurrentTickMs();

    while (this.tickAccumulator >= currentInterval && this.state === 'playing') {
      this.tickAccumulator -= currentInterval;
      this.step();
    }
  }

  private computeCurrentTickMs(): number {
    const stageInfo = this.stageManager.getStageInfo();
    return this.tickMs * stageInfo.speedFactor;
  }

  private step(): void {
    const { grid, bounds } = this.arena();
    const { minCol, minRow, maxCol, maxRow } = bounds;

    // Food magnet pull before moving
    if (this.magnetRange > 0) {
      let pullRange = this.magnetRange;
      // Synergy: Black Hole pulls across full map during combo
      if (this.comboChain && this.comboTracker.multiplier > 1) {
        pullRange = Math.max(grid.cols, grid.rows);
      }
      this.foodSpawner.pullTowardHead(this.snake.head, pullRange, (c) => this.isCellBlocked(c));

      // Food the pull landed on the head is eaten right away. Collection is
      // otherwise only checked after the snake has moved, which would strand
      // the pulled food underneath the body where it can never be reached —
      // the magnet would teleport food away instead of collecting it.
      for (;;) {
        const pulledIdx = this.foodSpawner.foodAt(this.snake.head);
        if (pulledIdx === -1) break;
        this.handleEatFood(pulledIdx);
        if (this.state !== 'playing') return; // A level-up pauses the run
      }
    }

    // Advance snake
    const newHead = this.snake.step(maxCol, maxRow, minCol, minRow, this.wallWrap, this.venomTrail);

    // Wall collision check (if wall wrap is false)
    if (!this.wallWrap) {
      if (newHead.col < minCol || newHead.col >= maxCol || newHead.row < minRow || newHead.row >= maxRow) {
        if (!this.trySurviveFatalCollision()) {
          this.die();
          return;
        }
      }
    }

    // Self collision check
    if (this.snake.hitsBody(newHead)) {
      if (this.armoredScales > 0) {
        this.armoredScales--;
        this.audio.hurt();
      } else if (!this.trySurviveFatalCollision()) {
        this.die();
        return;
      }
    }

    // Rock obstacle collision
    const rockIdx = this.rocks.findIndex((r) => r.col === newHead.col && r.row === newHead.row);
    if (rockIdx !== -1) {
      if (this.rockSmasherCount > 0) {
        this.rockSmasherCount--;
        this.rocks.splice(rockIdx, 1);
        this.audio.rockSmash();
      } else if (!this.trySurviveFatalCollision()) {
        this.die();
        return;
      }
    }

    // Check food consumption
    const foodIdx = this.foodSpawner.foodAt(newHead);
    if (foodIdx !== -1) {
      this.handleEatFood(foodIdx);
    }

    // Maintain food count — inside the arena the walls currently allow
    this.maintainFood(bounds);
  }

  /**
   * Tops the board up to the live orb count, spawning strictly inside `bounds`.
   *
   * A spawn that finds no free cell returns false and stops the loop, so a
   * packed arena can never spin here.
   */
  private maintainFood(bounds: ArenaBounds): void {
    const targetFoodCount = this.doubleFeast ? 2 : 1;
    while (this.foodSpawner.food.length < targetFoodCount) {
      const spawned = this.foodSpawner.spawnFood(bounds, (c) => this.isCellBlocked(c), this.goldenChance);
      if (!spawned) return;
    }
  }

  private handleEatFood(foodIndex: number): void {
    const food = this.foodSpawner.eat(foodIndex);
    this.totalFoodEaten++;
    this.stageManager.foodEatenThisStage++;

    // Combo multiplier
    const comboMult = this.comboChain ? this.comboTracker.registerEat() : 1;
    if (comboMult > 1) {
      this.audio.combo();
    }

    // Score & XP based on food type
    let xpGain: number = LEVELING.XP_PER_FOOD;
    let baseScore: number = SCORING.POINTS_PER_FOOD;

    if (food.kind === 'golden') {
      xpGain = LEVELING.XP_PER_GOLDEN;
      baseScore = SCORING.POINTS_PER_GOLDEN;
      this.audio.goldenEat();
    } else if (food.kind === 'poison') {
      xpGain = LEVELING.XP_PER_POISON;
      baseScore = SCORING.POINTS_PER_POISON;
      this.snake.shrink(FOOD.SHRINK_POISON);
      this.audio.hurt();
    } else {
      this.audio.eat();
    }

    // Stage multiplier & Fast Feast bonus
    const stageInfo = this.stageManager.getStageInfo();
    xpGain = Math.round(xpGain * stageInfo.xpMultiplier * (this.fastFeast ? RULES.FAST_FEAST_XP_MULT : 1));

    // Long Boi score multiplier
    const lengthMultiplier = this.longBoi ? 1 + Math.floor(this.snake.length / 5) * 0.5 : 1;
    // Fast Feast promises "+50% XP and score": the XP half is applied above,
    // the score half here (the two multipliers live in the config together).
    const feastBonus = this.fastFeast ? RULES.FAST_FEAST_SCORE_MULT : 1;
    this.score += Math.round(baseScore * comboMult * lengthMultiplier * feastBonus);

    // Growth check (Compact Coil grows every 2nd food)
    if (food.kind !== 'poison') {
      if (this.compactCoil) {
        this.compactCoilFoodCounter++;
        if (this.compactCoilFoodCounter % 2 === 0) {
          this.snake.grow(1);
        }
      } else {
        this.snake.grow(food.kind === 'golden' ? FOOD.GROW_GOLDEN : FOOD.GROW_NORMAL);
      }
    }

    // Phase Tail activation
    if (this.phaseTailTime > 0) {
      this.snake.phaseTailTimer = this.phaseTailTime;
    }

    // Gain XP and check level-up
    this.gainXP(xpGain);

    // Check Stage Clearance
    if (this.stageManager.foodEatenThisStage >= this.stageManager.foodGoal) {
      this.advanceStage();
    }
  }

  private gainXP(amount: number): void {
    this.xp += amount;
    if (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.triggerLevelUp();
    }
  }

  private triggerLevelUp(): void {
    this.audio.levelUp();
    this.currentChoices = pickRandomUpgrades(this, 3);
    this.state = 'upgrading';
  }

  private advanceStage(): void {
    this.stageManager.currentStage++;
    this.stageManager.foodEatenThisStage = 0;

    // Reset armored scales per stage
    if (this.chosenUpgrades.includes('armored_scales')) {
      this.armoredScales = 3;
    }

    const { grid, bounds } = this.arena();

    // The new stage may have contracted the arena (Firewall Lockdown): orbs the walls
    // just cut off are dropped, and the board is topped up again inside them —
    // otherwise an unreachable apple keeps glowing in the dead zone.
    this.foodSpawner.cullOutside(bounds);
    this.maintainFood(bounds);

    // Spawn new rocks for the stage
    const inset = this.stageManager.getStageInfo().shrinkInset;
    this.rocks = this.stageManager.generateRocks(
      grid.cols,
      grid.rows,
      inset,
      this.snake.body,
      this.foodSpawner.food.map((f) => f.cell),
    );
  }

  private performDash(): void {
    this.dashCooldownTimer = RULES.DASH_COOLDOWN;
    this.audio.dash();

    const { minCol, minRow, maxCol, maxRow } = this.arena().bounds;

    // Dash moves snake multiple steps ahead immediately
    for (let i = 0; i < RULES.DASH_DISTANCE; i++) {
      const head = this.snake.step(maxCol, maxRow, minCol, minRow, this.wallWrap, this.venomTrail);
      // Remove any rock dashed through
      const rockIdx = this.rocks.findIndex((r) => r.col === head.col && r.row === head.row);
      if (rockIdx !== -1) {
        this.rocks.splice(rockIdx, 1);
      }
      // Eat any food dashed through
      const foodIdx = this.foodSpawner.foodAt(head);
      if (foodIdx !== -1) {
        this.handleEatFood(foodIdx);
      }
    }
  }

  private trySurviveFatalCollision(): boolean {
    if (this.shedSkinCount > 0) {
      this.shedSkinCount--;
      const lost = this.snake.shrink(RULES.SHED_SKIN_SEGMENTS);
      this.audio.hurt();

      // Synergy Hydra: shed segments turn into temporary food
      if (this.splitTail && lost > 0) {
        this.foodSpawner.spawnFood(this.arena().bounds, (c) => this.isCellBlocked(c));
      }
      return true;
    }
    return false;
  }

  private isCellBlocked(cell: Cell): boolean {
    if (this.snake.occupies(cell)) return true;
    if (this.rocks.some((r) => r.col === cell.col && r.row === cell.row)) return true;
    return false;
  }

  /**
   * Venom Trail: a rock standing on a live trail dissolves.
   *
   * The trail decays in `snake.updateTimers`, so a rock left in the wake
   * disappears over the few seconds the venom lasts — the card's "dissolves
   * obstructing rocks over time". Rocks only ever land on a trail when a stage
   * advance seeds them over cells that are still toxic.
   */
  private dissolveRocksOnVenom(): void {
    if (this.rocks.length === 0 || this.snake.venomTrail.length === 0) return;

    this.rocks = this.rocks.filter(
      (rock) =>
        !this.snake.venomTrail.some((v) => v.cell.col === rock.col && v.cell.row === rock.row),
    );
  }

  private handleCardTap(tap: Point): void {
    const layout = upgradeCardLayout(this.layout.gameW, this.layout.gameH, this.currentChoices.length);

    // Check card picks
    for (let i = 0; i < this.currentChoices.length; i++) {
      if (hitTest(layout.cards[i], tap.x, tap.y)) {
        const picked = this.currentChoices[i];
        this.chosenUpgrades.push(picked.id);
        picked.apply(this);
        this.audio.cardPick();
        this.guaranteedRareNext = false;
        this.state = 'playing';
        return;
      }
    }

    // Check reroll button
    if (this.rerolls > 0 && hitTest(layout.reroll, tap.x, tap.y)) {
      this.rerolls--;
      this.audio.cardPick();
      this.currentChoices = pickRandomUpgrades(this, 3);
    }
  }

  private handleResultTap(tap: Point): void {
    const { restart, exit } = resultButtons(this.layout.gameW, this.layout.gameH);
    if (hitTest(restart, tap.x, tap.y)) {
      this.startRun(false); // Retry straight to gameplay (AGENTS.md §2)
    } else if (hitTest(exit, tap.x, tap.y) && !this.exitSignalled) {
      this.exitSignalled = true;
      this.bridge.exit(true, Math.floor(this.score)); // Exit at most once (AGENTS.md §4.2)
    }
  }

  private die(): void {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.isNewHi = true;
    }
    this.audio.death();
    // Endless roguelike run -> win: true (AGENTS.md §4.2)
    this.bridge.endRound(true, Math.floor(this.score));
  }

  private startRun(fromPlayScreen: boolean): void {
    if (fromPlayScreen) {
      this.bridge.launch(); // Launch fires exactly once per session
    }

    this.state = 'playing';
    this.score = 0;
    this.level = 1;
    this.xp = 0;
    this.totalFoodEaten = 0;
    this.runAge = 0;
    this.isNewHi = false;
    this.tickMs = SNAKE.BASE_INTERVAL * 1000;
    this.wallWrap = false;
    this.shedSkinCount = 0;
    this.magnetRange = 0;
    this.compactCoil = false;
    this.comboChain = false;
    this.goldenChance = FOOD.GOLDEN_CHANCE;
    this.phaseTailTime = 0;
    this.doubleFeast = false;
    this.rockSmasherCount = 0;
    this.hasDash = false;
    this.longBoi = false;
    this.splitTail = false;
    this.armoredScales = 0;
    this.venomTrail = false;
    this.fastFeast = false;
    this.rerolls = 1;
    this.guaranteedRareNext = false;
    this.chosenUpgrades = [];
    this.compactCoilFoodCounter = 0;
    this.dashCooldownTimer = 0;
    this.tickAccumulator = 0;
    this.comboTracker.reset();
    this.stageManager.currentStage = 1;
    this.stageManager.foodEatenThisStage = 0;

    this.resetWorld();
    this.bridge.startRound();
  }

  private resetWorld(): void {
    const { grid, bounds } = this.arena();
    const startCol = Math.floor(grid.cols / 2);
    const startRow = Math.floor(grid.rows / 2);

    this.snake = new Snake(startCol, startRow, SNAKE.START_LENGTH, 'right');
    this.foodSpawner = new FoodSpawner();
    this.rocks = [];

    // Initial food spawn
    this.foodSpawner.spawnFood(bounds, (c) => this.isCellBlocked(c), this.goldenChance);
  }
}
