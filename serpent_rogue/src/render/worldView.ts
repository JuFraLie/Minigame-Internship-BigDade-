// worldView.ts — the playfield itself: floor, grid, arena walls, venom, rocks,
// food orbs and the serpent.
//
// Rendering only: it reads the simulation through the controller's public state,
// converts grid cells into design coordinates with core/uiLayout.ts, and never
// touches a rule. It is the replaceable drawing half of a run — a headless test
// drives the same controller with no view at all (AGENTS.md §4.3).

import type Phaser from 'phaser';
import { THEME } from '../config/gameConfig.ts';
import type { Layout } from '../core/types.ts';
import { gridLayout, type GridLayout } from '../core/uiLayout.ts';
import type { Game } from '../game/game.ts';
import { fillCss, parseColor, strokeCss } from './color.ts';

// The serpent lives in its own Graphics: Phaser applies one GameObject alpha to
// a whole Graphics batch, and a phased tail is translucent while the arena
// behind it is not.
const DEPTH_FIELD = 0;
const DEPTH_SNAKE = 1;

/** Alpha of the serpent while Phase Tail is active. */
const PHASE_ALPHA = 0.55;

export class WorldView {
  private readonly field: Phaser.GameObjects.Graphics;
  private readonly serpent: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private readonly layout: Layout) {
    this.field = scene.add.graphics().setDepth(DEPTH_FIELD);
    this.serpent = scene.add.graphics().setDepth(DEPTH_SNAKE);
  }

  /** Repaints the whole playfield for the current frame. */
  render(game: Game): void {
    const gw = this.layout.gameW;
    const gh = this.layout.gameH;
    const grid = gridLayout(gw, gh);
    const stage = game.stageManager.getStageInfo();

    this.field.clear();

    // Arena floor. Anything outside this rectangle is the game's letterbox.
    fillCss(this.field, THEME.BG_DARK);
    this.field.fillRect(0, 0, gw, gh);

    this.drawGrid(grid, stage.shrinkInset, stage.modifier === 'golden_frenzy');
    this.drawVenom(game, grid);
    this.drawRocks(game, grid);
    this.drawFood(game, grid);

    this.serpent.clear();
    if (game.snake) {
      this.serpent.alpha = game.snake.isPhaseTailActive ? PHASE_ALPHA : 1;
      this.drawSnake(game, grid);
    }
  }

  destroy(): void {
    this.field.destroy();
    this.serpent.destroy();
  }

  private drawGrid(grid: GridLayout, inset: number, isGoldenFrenzy: boolean): void {
    const graphics = this.field;

    fillCss(graphics, THEME.BG_GRID);
    graphics.fillRect(grid.x, grid.y, grid.w, grid.h);

    strokeCss(graphics, THEME.GRID_LINE, 1);
    for (let c = 0; c <= grid.cols; c++) {
      const gx = grid.x + c * grid.cellSize;
      graphics.lineBetween(gx, grid.y, gx, grid.y + grid.h);
    }
    for (let r = 0; r <= grid.rows; r++) {
      const gy = grid.y + r * grid.cellSize;
      graphics.lineBetween(grid.x, gy, grid.x + grid.w, gy);
    }

    if (inset > 0) {
      // Contracted arena (Firewall Lockdown): darken everything the walls have claimed
      // and mark the new boundary.
      const wallX = grid.x + inset * grid.cellSize;
      const wallY = grid.y + inset * grid.cellSize;
      const wallW = (grid.cols - inset * 2) * grid.cellSize;
      const wallH = (grid.rows - inset * 2) * grid.cellSize;

      fillCss(graphics, THEME.DEAD_ZONE);
      graphics.fillRect(grid.x, grid.y, grid.w, wallY - grid.y);
      graphics.fillRect(grid.x, wallY + wallH, grid.w, grid.y + grid.h - (wallY + wallH));
      graphics.fillRect(grid.x, wallY, wallX - grid.x, wallH);
      graphics.fillRect(wallX + wallW, wallY, grid.x + grid.w - (wallX + wallW), wallH);

      // The lockdown fence: magenta signage around the surviving block.
      strokeCss(graphics, THEME.WALL_SHRINK, 2.5);
      graphics.strokeRect(wallX, wallY, wallW, wallH);
    } else {
      strokeCss(graphics, isGoldenFrenzy ? THEME.WALL_GOLDEN : THEME.WALL_COLOR, 2);
      graphics.strokeRect(grid.x, grid.y, grid.w, grid.h);
    }
  }

  private drawVenom(game: Game, grid: GridLayout): void {
    const graphics = this.field;
    const venom = parseColor(THEME.VENOM_COLOR);

    for (const v of game.snake.venomTrail) {
      const x = grid.x + v.cell.col * grid.cellSize;
      const y = grid.y + v.cell.row * grid.cellSize;
      graphics.fillStyle(venom.rgb, Math.min(0.5, v.life / 4));
      graphics.fillRect(x + 2, y + 2, grid.cellSize - 4, grid.cellSize - 4);
    }
  }

  private drawRocks(game: Game, grid: GridLayout): void {
    const cs = grid.cellSize;
    const graphics = this.field;

    for (const rock of game.rocks) {
      const rx = grid.x + rock.col * cs;
      const ry = grid.y + rock.row * cs;

      fillCss(graphics, THEME.ROCK_COLOR);
      graphics.fillRoundedRect(rx + 2, ry + 2, cs - 4, cs - 4, 4);

      fillCss(graphics, THEME.ROCK_HIGHLIGHT);
      graphics.fillRect(rx + 4, ry + 4, cs * 0.45, cs * 0.35);
    }
  }

  private drawFood(game: Game, grid: GridLayout): void {
    const cs = grid.cellSize;
    const r = cs / 2 - 2;
    const graphics = this.field;

    for (const food of game.foodSpawner.food) {
      const cx = grid.x + food.cell.col * cs + cs / 2;
      const cy = grid.y + food.cell.row * cs + cs / 2;
      const pulse = 1 + 0.12 * Math.sin(food.phase);

      let fill: string = THEME.FOOD_NORMAL;
      let glow: string = THEME.FOOD_GLOW;
      if (food.kind === 'golden') {
        fill = THEME.FOOD_GOLDEN;
        glow = THEME.FOOD_GOLDEN_GLOW;
      } else if (food.kind === 'poison') {
        fill = THEME.FOOD_POISON;
        glow = THEME.FOOD_POISON_GLOW;
      }

      // The glow, the orb and its gleam breathe together, so the pulse is a
      // radius multiplier rather than a transform.
      fillCss(graphics, glow);
      graphics.fillCircle(cx, cy, r * 1.5 * pulse);

      fillCss(graphics, fill);
      graphics.fillCircle(cx, cy, r * pulse);

      graphics.fillStyle(0xffffff, 0.75);
      graphics.fillCircle(cx - r * 0.3 * pulse, cy - r * 0.3 * pulse, r * 0.35 * pulse);
    }
  }

  private drawSnake(game: Game, grid: GridLayout): void {
    const cs = grid.cellSize;
    const snake = game.snake;
    const graphics = this.serpent;

    // Body segments, tail to neck — rounded squares in two alternating neon hues.
    for (let i = snake.body.length - 1; i >= 1; i--) {
      const seg = snake.body[i];
      const sx = grid.x + seg.col * cs;
      const sy = grid.y + seg.row * cs;

      fillCss(graphics, i % 2 === 0 ? THEME.SNAKE_BODY : THEME.SNAKE_BODY_ALT);
      graphics.fillRoundedRect(sx + 1.5, sy + 1.5, cs - 3, cs - 3, 5);
    }

    const head = snake.head;
    const hx = grid.x + head.col * cs;
    const hy = grid.y + head.row * cs;

    fillCss(graphics, THEME.SNAKE_HEAD);
    graphics.fillRoundedRect(hx + 1, hy + 1, cs - 2, cs - 2, 7);

    // Eyes look where the serpent faces.
    const eyeR = Math.max(2, cs * 0.14);
    const pupilR = Math.max(1, eyeR * 0.55);
    let eye1X = hx + cs * 0.3;
    let eye1Y = hy + cs * 0.3;
    let eye2X = hx + cs * 0.7;
    let eye2Y = hy + cs * 0.3;

    if (snake.direction === 'right') {
      eye1X = hx + cs * 0.7;
      eye1Y = hy + cs * 0.28;
      eye2X = hx + cs * 0.7;
      eye2Y = hy + cs * 0.72;
    } else if (snake.direction === 'left') {
      eye1X = hx + cs * 0.3;
      eye1Y = hy + cs * 0.28;
      eye2X = hx + cs * 0.3;
      eye2Y = hy + cs * 0.72;
    } else if (snake.direction === 'down') {
      eye1X = hx + cs * 0.28;
      eye1Y = hy + cs * 0.7;
      eye2X = hx + cs * 0.72;
      eye2Y = hy + cs * 0.7;
    }

    graphics.fillStyle(parseColor(THEME.SNAKE_EYES).rgb, 1);
    graphics.fillCircle(eye1X, eye1Y, eyeR);
    graphics.fillCircle(eye2X, eye2Y, eyeR);

    graphics.fillStyle(parseColor(THEME.SNAKE_PUPIL).rgb, 1);
    graphics.fillCircle(eye1X, eye1Y, pupilR);
    graphics.fillCircle(eye2X, eye2Y, pupilR);
  }
}
