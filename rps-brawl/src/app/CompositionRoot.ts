import { BridgeAdapter } from '../adapters/bridge/BridgeAdapter.ts';
import { BridgeReporter } from '../adapters/bridge/BridgeReporter.ts';
import { SoundFx } from '../adapters/audio/SoundFx.ts';
import { GameCore } from '../core/GameCore.ts';
import { RandomAdapter } from '../adapters/random/RandomAdapter.ts';
import { CardTapInput } from '../adapters/input/CardTapInput.ts';
import { FanOutEvents } from './FanOutEvents.ts';
import type { GameEventsPort } from '../ports/GameEventsPort.ts';
import type { HostSignalPort } from '../ports/HostSignalPort.ts';
import type { SceneContextPort } from '../ports/SceneContextPort.ts';
import type { SessionPort } from '../ports/SessionPort.ts';
import type { SoundPort } from '../ports/SoundPort.ts';
import { ENEMY_LOOK_COUNT } from '../presentation/art/TextureGenerator.ts';

/**
 * The composition root: the only place in the codebase that constructs
 * concrete implementations, and therefore the only layer allowed to know
 * that they exist.
 *
 * It *is* the `SceneContextPort` the scenes receive, so the rendering world
 * depends on a contract while the wiring stays in one auditable file.
 */
export class CompositionRoot implements SceneContextPort {
  /** Outbound signals to the host app. */
  readonly host: HostSignalPort;
  /** Offline sound effects for the renderer. */
  readonly sfx: SoundPort;
  /** Reports the finished round to the host as soon as the world ends it. */
  private readonly reporter: GameEventsPort;

  /** Independent stream used for purely cosmetic variety (enemy looks). */
  private readonly cosmeticRandom = new RandomAdapter();

  constructor() {
    this.host = new BridgeAdapter();
    this.sfx = new SoundFx();
    this.reporter = new BridgeReporter(this.host);
  }

  /** Wires a fresh game world for a single run. */
  createSession(listeners: ReadonlyArray<GameEventsPort>): SessionPort {
    const events = new FanOutEvents([this.reporter, ...listeners]);
    const core = new GameCore(events, new RandomAdapter());
    return {
      view: core,
      reveal: core,
      tap: new CardTapInput(core),
    };
  }

  /** A random cosmetic look for the next enemy. Never affects game logic. */
  nextEnemyLook(): number {
    return this.cosmeticRandom.pickInt(0, ENEMY_LOOK_COUNT - 1);
  }
}
