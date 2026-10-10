// tests/helpers.ts — shared fakes so every test can drive the game headless.
// Not a test file itself: the runner only collects tests/*.test.ts.

import type { ActionSource, InputAction, Layout, Point, PointerSource } from '../src/core/types.ts';
import { Game } from '../src/game/game.ts';
import type { GameBridge } from '../src/game/game.ts';
import { LAYOUT } from '../src/config/gameConfig.ts';

export const SCREEN = { w: 390, h: 844 } as const;
export const DT = 0.016;

/** A Layout that answers exactly like the real viewport, without any DOM. */
export function makeLayout(gameW: number = SCREEN.w, gameH: number = SCREEN.h): Layout {
  return {
    gameW,
    gameH,
    topInset: Math.max(Math.round(gameH * LAYOUT.TOP_PAD_RATIO), LAYOUT.TOP_PAD_MIN),
    floorY: () => Math.round(gameH * LAYOUT.FLOOR_RATIO),
    ceilY: () => Math.round(gameH * LAYOUT.CEIL_RATIO),
    knightX: () => Math.round(gameW * LAYOUT.KNIGHT_X_RATIO),
  };
}

/** Records what the game asked the host to do. */
export class FakeBridge implements GameBridge {
  readonly calls: string[] = [];

  launch(): void {
    this.calls.push('launch');
  }

  startRound(): void {
    this.calls.push('startRound');
  }

  endRound(win: boolean, score: number): void {
    this.calls.push(`endRound:${win}:${score}`);
  }

  exit(win: boolean, score: number): void {
    this.calls.push(`exit:${win}:${score}`);
  }
}

/** Silences the audio port; also lets a test assert on cues. */
export class FakeAudio {
  readonly calls: string[] = [];

  jump(): void {
    this.calls.push('jump');
  }

  shield(): void {
    this.calls.push('shield');
  }

  death(): void {
    this.calls.push('death');
  }

  milestone(): void {
    this.calls.push('milestone');
  }

  coin(): void {
    this.calls.push('coin');
  }

  heart(): void {
    this.calls.push('heart');
  }

  hurt(): void {
    this.calls.push('hurt');
  }
}

export class ScriptedInput implements ActionSource {
  private readonly queue: InputAction[] = [];

  press(action: Exclude<InputAction, null>): void {
    this.queue.push(action);
  }

  consume(): InputAction {
    return this.queue.shift() ?? null;
  }
}

export class ScriptedPointer implements PointerSource {
  private readonly taps: Point[] = [];

  tapAt(x: number, y: number): void {
    this.taps.push({ x, y });
  }

  consume(): Point | null {
    return this.taps.shift() ?? null;
  }
}

export interface Harness {
  game: Game;
  bridge: GameBridge;
  audio: FakeAudio;
  input: ScriptedInput;
  pointer: ScriptedPointer;
  layout: Layout;
}

export function buildGame(bridge: GameBridge = new FakeBridge()): Harness {
  const layout = makeLayout();
  const audio = new FakeAudio();

  return {
    game: new Game(layout, audio, bridge),
    bridge,
    audio,
    input: new ScriptedInput(),
    pointer: new ScriptedPointer(),
    layout,
  };
}

export function step(h: Harness, frames = 1, dt = DT): void {
  for (let i = 0; i < frames; i++) h.game.update(dt, h.input, h.pointer);
}

/** Parks a spike cluster on top of the knight so the very next frame is fatal. */
export function forceDeath(h: Harness): void {
  h.game.hearts = 1;
  h.game.knight.hurt(0);
  h.game.spawner.obstacles.push({
    type: 'spike_cluster',
    x: h.layout.knightX() + 80,
    active: true,
    spikeCount: 3,
    spikeH: 60,
  });
}

/** Plays until the Result Panel is up, and returns the finalised score. */
export function playUntilDead(h: Harness, budgetFrames = 10_000): number {
  for (let i = 0; i < budgetFrames; i++) {
    step(h);
    if (h.game.state === 'dead') return Math.floor(h.game.score);
  }
  throw new Error('the run never reached the Result Panel');
}
