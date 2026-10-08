import { AudioEngine } from '../adapters/audio/AudioEngine.ts';
import { BridgeAdapter } from '../adapters/bridge/BridgeAdapter.ts';
import { BridgeReporter } from '../adapters/bridge/BridgeReporter.ts';
import { FrameClock } from '../adapters/clock/FrameClock.ts';
import { CombinedInput } from '../adapters/input/CombinedInput.ts';
import { DragMoveInput } from '../adapters/input/DragMoveInput.ts';
import { KeyboardMoveInput } from '../adapters/input/KeyboardMoveInput.ts';
import { ViewportAdapter } from '../adapters/input/ViewportAdapter.ts';
import { RandomAdapter } from '../adapters/random/RandomAdapter.ts';
import { GameSession } from '../core/GameSession.ts';
import { GameWorld } from '../core/GameWorld.ts';
import type { WorldEventsPort } from '../core/types.ts';
import type { ReportPort } from '../ports/ReportPort.ts';
import type { SceneContextPort } from '../ports/SceneContextPort.ts';
import type { SessionPort } from '../ports/SessionPort.ts';
import type { SoundPort } from '../ports/SoundPort.ts';
import type { ViewportPort } from '../ports/ViewportPort.ts';
import { FanOutEvents } from './FanOutEvents.ts';

/**
 * The composition root: the only place in the codebase that constructs a
 * concrete implementation, and therefore the only layer allowed to know that
 * they exist.
 *
 * It *is* the `SceneContextPort` the scenes receive, so the rendering world
 * depends on contracts while the wiring stays in one auditable file.
 *
 * Everything that carries per-round state - the world, the clock, the finger -
 * is created fresh inside `createSession`, so a Retry never inherits anything
 * from the round that just ended.
 */
export class CompositionRoot implements SceneContextPort {
  /** Outbound signals to the host app. */
  readonly host: ReportPort;
  /** Screen-to-world mapping; shared, because the camera outlives a round. */
  readonly viewport: ViewportPort;
  /** Every cue the player hears; one engine, so the loop survives the scenes. */
  readonly sound: SoundPort;

  /** Reports the finished round to the host as soon as the world ends it. */
  private readonly reporter: WorldEventsPort;
  private readonly viewportAdapter: ViewportAdapter;

  constructor() {
    this.viewportAdapter = new ViewportAdapter();
    this.viewport = this.viewportAdapter;
    this.host = new BridgeAdapter();
    this.reporter = new BridgeReporter(this.host);
    this.sound = new AudioEngine();
  }

  createSession(listeners: readonly WorldEventsPort[]): SessionPort {
    // Two ways to steer, one move vector out: the drag keeps the stick it
    // draws, the keyboard reports held directions, and the composite decides
    // which of them the simulation hears this frame.
    const drag = new DragMoveInput(this.viewportAdapter);
    const keys = new KeyboardMoveInput(this.viewportAdapter);
    const input = new CombinedInput(drag, keys);

    const world = new GameWorld(
      new RandomAdapter(),
      new FanOutEvents([this.reporter, ...listeners]),
    );
    return new GameSession(world, new FrameClock(), input, input, input);
  }
}
