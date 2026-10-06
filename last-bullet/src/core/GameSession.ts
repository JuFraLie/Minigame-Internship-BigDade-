import type { ClockPort } from '../ports/ClockPort.ts';
import type { InputPort } from '../ports/InputPort.ts';
import type { KeyboardPort } from '../ports/KeyboardPort.ts';
import type { PointerPort } from '../ports/PointerPort.ts';
import type { RenderPort } from '../ports/RenderPort.ts';
import type { SessionPort } from '../ports/SessionPort.ts';
import type { UpgradePort } from '../ports/UpgradePort.ts';
import { FixedStepDriver } from './FixedStepDriver.ts';
import type { GameWorld } from './GameWorld.ts';

/**
 * One playable round, bundled the way the `Game` scene wants it.
 *
 * Owns the world and the driver and glues them to the `SessionPort` contract,
 * so the scene only ever calls `frame(deltaMs)`, `render.getFrame()`,
 * `upgrades.choose(id)` and `keyboard.setHeld(...)`. Freezing is enforced here
 * as well as in the scene: while a card is on offer the clock is not even
 * read, so no time banks up behind the overlay.
 */
export class GameSession implements SessionPort {
  readonly render: RenderPort;
  readonly upgrades: UpgradePort;
  readonly pointer: PointerPort;
  readonly keyboard: KeyboardPort;
  readonly input: InputPort;

  private readonly world: GameWorld;
  private readonly clock: ClockPort;
  private readonly driver: FixedStepDriver;

  constructor(
    world: GameWorld,
    clock: ClockPort,
    input: InputPort,
    pointer: PointerPort,
    keyboard: KeyboardPort,
  ) {
    this.world = world;
    this.clock = clock;
    this.input = input;
    this.pointer = pointer;
    this.keyboard = keyboard;
    this.render = world;
    this.upgrades = world;
    this.driver = new FixedStepDriver(clock, input);
  }

  frame(deltaMs: number): void {
    if (this.world.frozen()) return;

    this.clock.advance(deltaMs);
    this.driver.run((dt, move) => this.world.step(dt, move));
  }

  setViewSize(width: number, height: number): void {
    this.world.setViewSize(width, height);
  }
}
