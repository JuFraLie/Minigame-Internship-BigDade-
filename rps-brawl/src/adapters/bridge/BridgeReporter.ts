import type { GameEventsPort } from '../../ports/GameEventsPort.ts';
import type { HostSignalPort } from '../../ports/HostSignalPort.ts';
import type {
  ClashTiedEvent,
  EnemyDefeatedEvent,
  HeartLostEvent,
  RunEndedEvent,
  SignRevealedEvent,
} from '../../core/types.ts';

/**
 * The host-facing half of the game world: it listens to `GameEventsPort` and
 * reports the finished round. Endless game, so the run always counts as a win.
 *
 * Everything else about the run (animation, sound) belongs to the renderer and
 * is deliberately not handled here.
 */
export class BridgeReporter implements GameEventsPort {
  private readonly host: HostSignalPort;

  constructor(host: HostSignalPort) {
    this.host = host;
  }

  onRunEnded(event: RunEndedEvent): void {
    this.host.endRound({ win: true, score: event.score });
  }

  onSignRevealed(_event: SignRevealedEvent): void { /* renderer's business */ }
  onEnemyDefeated(_event: EnemyDefeatedEvent): void { /* renderer's business */ }
  onHeartLost(_event: HeartLostEvent): void { /* renderer's business */ }
  onClashTied(_event: ClashTiedEvent): void { /* renderer's business */ }
}
