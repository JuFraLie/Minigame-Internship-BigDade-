// game.test.ts — Unit tests for Serpent Rogue game logic.
// Runs headless using Node's native test runner (node --test --experimental-strip-types).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cell, DirectionSource, Layout, PointerSource } from '../src/core/types.ts';
import { gridLayout, resultButtons, upgradeCardLayout } from '../src/core/uiLayout.ts';
import { FoodSpawner } from '../src/game/food.ts';
import { Game, type GameAudio, type GameBridge } from '../src/game/game.ts';
import { ComboTracker, xpNeededForLevel } from '../src/game/scoring.ts';
import { Snake } from '../src/game/snake.ts';
import { StageManager } from '../src/game/stages.ts';
import { ALL_UPGRADES, pickRandomUpgrades, type UpgradeState } from '../src/game/upgrades.ts';

// Mock layout for headless testing (20x20 virtual space)
const mockLayout: Layout = {
  gameW: 360,
  gameH: 640,
};

// Mock audio
const mockAudio: GameAudio = {
  eat() {},
  goldenEat() {},
  levelUp() {},
  cardPick() {},
  hurt() {},
  death() {},
  rockSmash() {},
  dash() {},
  combo() {},
};

// Mock bridge
function createMockBridge() {
  const events: string[] = [];
  const bridge: GameBridge = {
    launch() { events.push('launch'); },
    startRound() { events.push('startRound'); },
    endRound(win, score) { events.push(`endRound:${win}:${score}`); },
    exit(win, score) { events.push(`exit:${win}:${score}`); },
  };
  return { bridge, events };
}

const NO_TURN: DirectionSource = { consume: () => null };
const NO_TAP: PointerSource = { consume: () => null };

/** A tap that lands in the middle of a rectangle, in playfield coordinates. */
function tapOn(rect: { x: number; y: number; w: number; h: number }): PointerSource {
  return { consume: () => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }) };
}

/**
 * Drives a live run into the top wall, deterministically: the only food is
 * parked off the path so no accidental level-up can pause the run, and every
 * step is fed a single 'up' turn (queueDirection ignores repeats).
 */
function killRun(game: Game): void {
  game.foodSpawner.food = [{ cell: { col: 0, row: 0 }, kind: 'normal', phase: 0 }];
  const up: DirectionSource = { consume: () => 'up' };

  for (let i = 0; i < 40 && game.state === 'playing'; i++) {
    game.update(0.21, up, NO_TAP);
  }

  assert.equal(game.state, 'dead');
}

describe('Serpent Rogue — Game Logic Tests', () => {
  describe('Snake Mechanics', () => {
    it('moves one cell forward in current direction', () => {
      const snake = new Snake(5, 5, 3, 'right');
      assert.deepEqual(snake.head, { col: 5, row: 5 });

      const newHead = snake.step(20, 20, 0, 0, false);
      assert.deepEqual(newHead, { col: 6, row: 5 });
      assert.deepEqual(snake.head, { col: 6, row: 5 });
      assert.equal(snake.length, 3);
    });

    it('turns direction correctly', () => {
      const snake = new Snake(5, 5, 3, 'right');
      snake.queueDirection('down');
      const head = snake.step(20, 20, 0, 0, false);
      assert.deepEqual(head, { col: 5, row: 6 });
      assert.equal(snake.direction, 'down');
    });

    it('rejects 180-degree instant reversal', () => {
      const snake = new Snake(5, 5, 3, 'right');
      snake.queueDirection('left'); // Illegal turn
      const head = snake.step(20, 20, 0, 0, false);
      assert.deepEqual(head, { col: 6, row: 5 });
      assert.equal(snake.direction, 'right');
    });

    it('grows when grow() is called', () => {
      const snake = new Snake(5, 5, 3, 'right');
      snake.grow(1);
      snake.step(20, 20, 0, 0, false);
      assert.equal(snake.length, 4);
    });

    it('shrinks when shrink() is called but preserves head', () => {
      const snake = new Snake(5, 5, 5, 'right');
      const lost = snake.shrink(3);
      assert.equal(lost, 3);
      assert.equal(snake.length, 2);
    });

    it('wraps around borders when wallWrap is true', () => {
      const snake = new Snake(19, 5, 3, 'right');
      const wrappedHead = snake.step(20, 20, 0, 0, true);
      assert.equal(wrappedHead.col, 0); // Wrapped from col 19 to 0
    });

    it('ignores self body collision when Phase Tail is active', () => {
      const snake = new Snake(5, 5, 4, 'right');
      const bodyCell: Cell = { ...snake.body[2] };

      assert.equal(snake.hitsBody(bodyCell), true);

      snake.phaseTailTimer = 3.0;
      assert.equal(snake.hitsBody(bodyCell), false); // Harmless!
    });
  });

  describe('Leveling & Scoring Formulas', () => {
    it('calculates XP needed per level = 3 + level * 2', () => {
      assert.equal(xpNeededForLevel(1), 5);
      assert.equal(xpNeededForLevel(2), 7);
      assert.equal(xpNeededForLevel(3), 9);
      assert.equal(xpNeededForLevel(5), 13);
    });

    it('tracks combo multiplier on rapid eating', () => {
      const combo = new ComboTracker();
      assert.equal(combo.multiplier, 1);

      assert.equal(combo.registerEat(), 1); // 1st food: 1x
      assert.equal(combo.registerEat(), 2); // 2nd food in window: 2x
      assert.equal(combo.registerEat(), 3); // 3rd food: 3x
      assert.equal(combo.multiplier, 3);

      combo.update(3.0); // Window expired
      assert.equal(combo.multiplier, 1);
    });
  });

  describe('Upgrade Pool & Selection', () => {
    it('picks 3 valid upgrades without exceeding max stacks', () => {
      const mockState: UpgradeState = {
        tickMs: 200,
        wallWrap: false,
        shedSkinCount: 0,
        magnetRange: 0,
        compactCoil: false,
        comboChain: false,
        goldenChance: 0.1,
        phaseTailTime: 0,
        doubleFeast: false,
        rockSmasherCount: 0,
        hasDash: false,
        longBoi: false,
        splitTail: false,
        armoredScales: 0,
        venomTrail: false,
        fastFeast: false,
        rerolls: 1,
        guaranteedRareNext: false,
        chosenUpgrades: ['wall_wrap'], // Wall wrap already picked (max 1)
        snakeLength: 5,
        shrinkSnake() {},
      };

      const choices = pickRandomUpgrades(mockState, 3);
      assert.equal(choices.length, 3);
      // Wall wrap should not appear again
      assert.ok(!choices.some((c) => c.id === 'wall_wrap'));
    });

    it('applies Slow Time upgrade correctly', () => {
      const slowUpgrade = ALL_UPGRADES.find((u) => u.id === 'slow_time')!;
      const state: Partial<UpgradeState> = { tickMs: 200 };
      slowUpgrade.apply(state as UpgradeState);
      assert.ok(state.tickMs! > 200);
    });
  });

  describe('Food Spawner & Magnet', () => {
    it('only ever places food inside the arena bounds it was given', () => {
      const spawner = new FoodSpawner();
      const bounds = { minCol: 2, minRow: 2, maxCol: 5, maxRow: 5 };

      // A 3 × 3 arena holds exactly nine orbs — fill it cell by cell.
      for (let i = 0; i < 9; i++) {
        assert.equal(spawner.spawnFood(bounds, () => false), true);
      }

      for (const food of spawner.food) {
        assert.ok(food.cell.col >= 2 && food.cell.col < 5, `col ${food.cell.col} escaped the arena`);
        assert.ok(food.cell.row >= 2 && food.cell.row < 5, `row ${food.cell.row} escaped the arena`);
      }

      // The tenth has nowhere left to go inside the arena.
      assert.equal(spawner.spawnFood(bounds, () => false), false);
      assert.equal(spawner.food.length, 9);
    });

    it('reports a full or degenerate arena instead of spinning', () => {
      const spawner = new FoodSpawner();

      // One cell, taken: no room for a second orb.
      const single = { minCol: 0, minRow: 0, maxCol: 1, maxRow: 1 };
      assert.equal(spawner.spawnFood(single, () => false), true);
      assert.equal(spawner.spawnFood(single, () => false), false);

      // A stage can contract the arena down to nothing at all.
      const empty = { minCol: 3, minRow: 3, maxCol: 3, maxRow: 4 };
      assert.equal(spawner.spawnFood(empty, () => false), false);
      assert.equal(spawner.food.length, 1);
    });

    it('culls the orbs a contracted wall cut off', () => {
      const spawner = new FoodSpawner();
      spawner.food = [
        { cell: { col: 0, row: 0 }, kind: 'normal', phase: 0 },
        { cell: { col: 4, row: 4 }, kind: 'golden', phase: 0 },
      ];

      const removed = spawner.cullOutside({ minCol: 1, minRow: 1, maxCol: 14, maxRow: 21 });

      assert.equal(removed, 1);
      assert.deepEqual(spawner.food.map((f) => f.cell), [{ col: 4, row: 4 }]);
    });

    it('pulls food toward snake head when in magnet range', () => {
      const spawner = new FoodSpawner();
      spawner.food.push({
        cell: { col: 5, row: 8 },
        kind: 'normal',
        phase: 0,
      });

      const head: Cell = { col: 5, row: 6 }; // 2 cells away
      spawner.pullTowardHead(head, 3, () => false);

      // Food should have moved 1 step closer to row 7
      assert.deepEqual(spawner.food[0].cell, { col: 5, row: 7 });
    });
  });

  describe('Stages & Modifiers', () => {
    it('progresses stage numbers and provides distinct environmental rules', () => {
      const stages = new StageManager();
      assert.equal(stages.currentStage, 1);
      assert.equal(stages.getStageInfo(1).modifier, 'standard');
      assert.equal(stages.getStageInfo(2).modifier, 'rocks');
      assert.equal(stages.getStageInfo(3).modifier, 'shrink');
      assert.equal(stages.getStageInfo(4).modifier, 'fast');
      assert.equal(stages.getStageInfo(5).modifier, 'golden_frenzy');
    });
  });

  describe('Shrinking Arena & Food Placement', () => {
    /** Asserts every live orb sits inside the arena the current stage allows. */
    function assertFoodInsideArena(game: Game): void {
      const grid = gridLayout(mockLayout.gameW, mockLayout.gameH);
      const inset = game.stageManager.getStageInfo().shrinkInset;

      for (const food of game.foodSpawner.food) {
        assert.ok(
          food.cell.col >= inset && food.cell.col < grid.cols - inset,
          `orb at col ${food.cell.col} sits outside the arena (inset ${inset})`,
        );
        assert.ok(
          food.cell.row >= inset && food.cell.row < grid.rows - inset,
          `orb at row ${food.cell.row} sits outside the arena (inset ${inset})`,
        );
      }
    }

    it('spawns food only inside a contracted arena', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      game.stageManager.currentStage = 3; // Firewall Lockdown: walls contract a cell per side
      assert.ok(game.stageManager.getStageInfo().shrinkInset > 0);
      game.wallWrap = true; // Wrap rather than die, so the run outlives the sampling

      let spawned = 0;
      for (let i = 0; i < 30 && game.state === 'playing'; i++) {
        game.foodSpawner.food = []; // Empty board → every tick exercises a fresh spawn
        game.update(0.21, NO_TURN, NO_TAP);

        spawned += game.foodSpawner.food.length;
        assertFoodInsideArena(game);
      }

      assert.ok(spawned > 0, 'expected at least one orb to be spawned');
    });

    it('drops the orbs a contracting stage cuts off and tops the board back up', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      // The next bite clears stage 2 and opens stage 3 (Firewall Lockdown).
      game.stageManager.currentStage = 2;
      game.stageManager.foodEatenThisStage = game.stageManager.foodGoal - 1;

      const head = game.snake.head;
      game.foodSpawner.food = [
        { cell: { col: head.col + 1, row: head.row }, kind: 'normal', phase: 0 },
        // Parked on a cell the stage-3 wall is about to claim — unreachable.
        { cell: { col: 0, row: 0 }, kind: 'golden', phase: 0 },
      ];

      game.update(0.21, NO_TURN, NO_TAP); // bite → stage advance

      assert.equal(game.stageManager.currentStage, 3);
      assert.ok(game.stageManager.getStageInfo().shrinkInset > 0);
      assert.ok(game.foodSpawner.food.length >= 1, 'the board must still carry an orb');
      assertFoodInsideArena(game);
    });
  });

  describe('Game Controller Headless Loop', () => {
    it('initializes in start state and launches on handleAnyInput', () => {
      const { bridge, events } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);

      assert.equal(game.state, 'start');
      game.handleAnyInput();

      assert.equal(game.state, 'playing');
      assert.ok(events.includes('launch'));
      assert.ok(events.includes('startRound'));
    });

    it('revives using Shed Skin upon fatal collision', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      // Give snake shed skin revive
      game.shedSkinCount = 1;

      // Force a self-collision: park segments on the cells the head is about
      // to enter (a single one would be popped off the tail on this step).
      const head = game.snake.head;
      game.snake.body.push({ col: head.col + 1, row: head.row }, { col: head.col + 2, row: head.row });

      // Step simulation
      game.update(0.3, { consume: () => null }, { consume: () => null });

      // Player should still be alive because Shed Skin absorbed the hit
      assert.equal(game.state, 'playing');
      assert.equal(game.shedSkinCount, 0); // Revive consumed
    });

    it('reports endRound once when the run ends', () => {
      const { bridge, events } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      killRun(game);
      // Endless run → win: true (AGENTS.md §4.2), reported when the Result
      // Panel takes over.
      assert.ok(events.includes('endRound:true:0'));
      assert.equal(events.filter((e) => e.startsWith('endRound')).length, 1);
    });

    it('restarts straight into gameplay from the Result Panel', () => {
      const { bridge, events } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();
      killRun(game);

      const { restart } = resultButtons(mockLayout.gameW, mockLayout.gameH);
      game.update(0.016, NO_TURN, tapOn(restart));

      // Retry goes directly back to a fresh run — the Play Screen never replays.
      assert.equal(game.state, 'playing');
      assert.equal(game.score, 0);
      assert.equal(events.filter((e) => e === 'launch').length, 1);
      assert.equal(events.filter((e) => e === 'startRound').length, 2);
    });

    it('exits at most once from the Result Panel and does nothing else', () => {
      const { bridge, events } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();
      killRun(game);

      const { exit } = resultButtons(mockLayout.gameW, mockLayout.gameH);
      const tap = tapOn(exit);
      game.update(0.016, NO_TURN, tap);
      game.update(0.016, NO_TURN, tap);

      assert.deepEqual(events.filter((e) => e.startsWith('exit')), ['exit:true:0']);
      // Exit changes nothing else: no navigation, no restart (AGENTS.md §2).
      assert.equal(game.state, 'dead');
    });

    it('picks an offered upgrade card from a tap on its rectangle', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      // Deterministic level-up: park the next bite one cell ahead of the head
      // (snake spawns heading right) and top the XP bar up to the threshold,
      // so the very next tick eats and levels up.
      const head = game.snake.head;
      game.xp = game.xpNeeded;
      game.foodSpawner.food = [
        { cell: { col: head.col + 1, row: head.row }, kind: 'normal', phase: 0 },
      ];

      game.update(0.21, NO_TURN, NO_TAP); // one 200 ms tick → eat → level up

      assert.equal(game.state, 'upgrading');
      assert.equal(game.currentChoices.length, 3);

      const layout = upgradeCardLayout(mockLayout.gameW, mockLayout.gameH, game.currentChoices.length);
      game.update(0.016, NO_TURN, tapOn(layout.cards[0]));

      assert.equal(game.state, 'playing');
      assert.equal(game.chosenUpgrades.length, 1);
    });

    it('eats the food the magnet pulls onto the head', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();
      game.magnetRange = 3;

      // One cell above the head: the pull drags it straight onto the head
      // cell, which is exactly where the old code stranded it under the body.
      const head = game.snake.head;
      game.foodSpawner.food = [
        { cell: { col: head.col, row: head.row - 1 }, kind: 'normal', phase: 0 },
      ];

      game.update(0.21, NO_TURN, NO_TAP); // one 200 ms tick → pull → eat

      assert.equal(game.totalFoodEaten, 1);
      assert.equal(game.score, 10);
      assert.equal(game.state, 'playing'); // 1 XP < the 5 needed to level up
    });

    it('gives Fast Feast its advertised +50% score bonus', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();
      ALL_UPGRADES.find((u) => u.id === 'fast_feast')!.apply(game);

      const head = game.snake.head;
      game.foodSpawner.food = [
        { cell: { col: head.col + 1, row: head.row }, kind: 'normal', phase: 0 },
      ];

      game.update(0.21, NO_TURN, NO_TAP); // bite → 10 base × 1.5

      assert.equal(game.score, 15);
      assert.equal(game.xp, 2); // 1 XP × 1.5, rounded
    });

    it('clears the combo window when a retry starts a new run', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();
      game.comboChain = true;
      game.comboTracker.registerEat();
      assert.equal(game.comboTracker.count, 1);

      killRun(game);
      const { restart } = resultButtons(mockLayout.gameW, mockLayout.gameH);
      game.update(0.016, NO_TURN, tapOn(restart));

      // The new run must not inherit the previous run's combo.
      assert.equal(game.state, 'playing');
      assert.equal(game.comboTracker.count, 0);
      assert.equal(game.comboTracker.timer, 0);
    });

    it('drops turns made while the level-up overlay is open', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      // Deterministic level-up (see the card test above).
      const head = game.snake.head;
      game.xp = game.xpNeeded;
      game.foodSpawner.food = [
        { cell: { col: head.col + 1, row: head.row }, kind: 'normal', phase: 0 },
      ];
      game.update(0.21, NO_TURN, NO_TAP);
      assert.equal(game.state, 'upgrading');

      // A swipe across the overlay is read as a turn, but a turn has no
      // meaning while the player is picking a card: it must not survive into
      // the run and snap the snake sideways afterwards.
      const down: DirectionSource = { consume: () => 'down' };
      const layout = upgradeCardLayout(mockLayout.gameW, mockLayout.gameH, game.currentChoices.length);
      game.update(0.016, down, tapOn(layout.cards[0]));
      assert.equal(game.state, 'playing');

      game.update(0.21, NO_TURN, NO_TAP); // next tick steps the snake
      assert.equal(game.snake.direction, 'right');
    });

    it('dissolves a rock left standing on a live venom trail', () => {
      const { bridge } = createMockBridge();
      const game = new Game(mockLayout, mockAudio, bridge);
      game.handleAnyInput();

      game.rocks = [{ col: 1, row: 1 }, { col: 5, row: 5 }];
      game.snake.venomTrail.push({ cell: { col: 1, row: 1 }, life: 4 });

      game.update(0.05, NO_TURN, NO_TAP); // venom works through the rock

      assert.deepEqual(game.rocks, [{ col: 5, row: 5 }]);
      assert.equal(game.state, 'playing');
    });
  });
});
