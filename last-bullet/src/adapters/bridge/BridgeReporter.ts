import type {
  BulletFiredEvent,
  BulletPickedUpEvent,
  EnemyKilledEvent,
  ExplosionEvent,
  LevelUpEvent,
  PlayerHitEvent,
  RunEndedEvent,
  UpgradeChosenEvent,
  WorldEventsPort,
} from '../../core/types.ts';
import type { ReportPort } from '../../ports/ReportPort.ts';

/**
 * The host-facing half of the game world: it listens to `WorldEventsPort` and
 * reports the finished round the moment the Result Panel is about to show.
 *
 * Everything else the world reports - hits, pickups, level-ups - belongs to the
 * renderer and is deliberately not handled here.
 */
export class BridgeReporter implements WorldEventsPort {
  private readonly report: ReportPort;

  constructor(report: ReportPort) {
    this.report = report;
  }

  onRunEnded(event: RunEndedEvent): void {
    this.report.endRound({ win: event.win, score: event.score });
  }

  onLevelUp(_event: LevelUpEvent): void { /* renderer's business */ }
  onEnemyKilled(_event: EnemyKilledEvent): void { /* renderer's business */ }
  onPlayerHit(_event: PlayerHitEvent): void { /* renderer's business */ }
  onBulletFired(_event: BulletFiredEvent): void { /* renderer's business */ }
  onBulletPickedUp(_event: BulletPickedUpEvent): void { /* renderer's business */ }
  onExplosion(_event: ExplosionEvent): void { /* renderer's business */ }
  onUpgradeChosen(_event: UpgradeChosenEvent): void { /* renderer's business */ }
}
