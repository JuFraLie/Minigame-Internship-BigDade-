import type { WorldEventsPort } from '../core/types.ts';
import type { ReportPort } from './ReportPort.ts';
import type { SessionPort } from './SessionPort.ts';
import type { ViewportPort } from './ViewportPort.ts';

/**
 * Everything a scene is allowed to ask for.
 *
 * The scenes are the edge of the rendering world: they may only talk to the
 * outside through this bundle of ports, never through a concrete class. The
 * composition root (`src/app`) is what actually implements it and hands it
 * over through the Phaser registry.
 */
export interface SceneContextPort {
  /** Outbound signals to the host app. */
  readonly host: ReportPort;
  /** Screen-to-world mapping, reported to by the renderer each frame. */
  readonly viewport: ViewportPort;
  /** Wires a fresh game world for a single round. */
  createSession(listeners: readonly WorldEventsPort[]): SessionPort;
}
