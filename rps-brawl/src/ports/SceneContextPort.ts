import type { GameEventsPort } from './GameEventsPort.ts';
import type { HostSignalPort } from './HostSignalPort.ts';
import type { SessionPort } from './SessionPort.ts';
import type { SoundPort } from './SoundPort.ts';

/**
 * Everything a scene is allowed to ask for.
 *
 * The scenes are the edge of the rendering world: they may only talk to the
 * outside through this bundle of ports, never through a concrete class. The
 * composition root (`src/app`) is what actually implements it and hands it
 * over through the Phaser registry / scene data.
 */
export interface SceneContextPort {
  /** Outbound signals to the host app. */
  readonly host: HostSignalPort;
  /** Outbound feedback the player hears. */
  readonly sfx: SoundPort;
  /** Wires a fresh game world for a single run. */
  createSession(listeners: ReadonlyArray<GameEventsPort>): SessionPort;
  /** A random cosmetic look for the next enemy. Never affects game logic. */
  nextEnemyLook(): number;
}
