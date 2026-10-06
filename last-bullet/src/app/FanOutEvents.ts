import type { WorldEventsPort } from '../core/types.ts';

/**
 * Forwards every world event to every listener.
 *
 * The host reporter and the scene's own effects both want to know when the
 * round ends, and neither may be able to silence the other.
 */
export class FanOutEvents implements WorldEventsPort {
  private readonly listeners: readonly WorldEventsPort[];

  constructor(listeners: readonly WorldEventsPort[]) {
    this.listeners = listeners;
  }

  onRunEnded(event: Parameters<WorldEventsPort['onRunEnded']>[0]): void {
    for (const listener of this.listeners) listener.onRunEnded(event);
  }

  onLevelUp(event: Parameters<WorldEventsPort['onLevelUp']>[0]): void {
    for (const listener of this.listeners) listener.onLevelUp(event);
  }

  onEnemyKilled(event: Parameters<WorldEventsPort['onEnemyKilled']>[0]): void {
    for (const listener of this.listeners) listener.onEnemyKilled(event);
  }

  onPlayerHit(event: Parameters<WorldEventsPort['onPlayerHit']>[0]): void {
    for (const listener of this.listeners) listener.onPlayerHit(event);
  }

  onBulletFired(event: Parameters<WorldEventsPort['onBulletFired']>[0]): void {
    for (const listener of this.listeners) listener.onBulletFired(event);
  }

  onBulletPickedUp(event: Parameters<WorldEventsPort['onBulletPickedUp']>[0]): void {
    for (const listener of this.listeners) listener.onBulletPickedUp(event);
  }

  onExplosion(event: Parameters<WorldEventsPort['onExplosion']>[0]): void {
    for (const listener of this.listeners) listener.onExplosion(event);
  }

  onUpgradeChosen(event: Parameters<WorldEventsPort['onUpgradeChosen']>[0]): void {
    for (const listener of this.listeners) listener.onUpgradeChosen(event);
  }
}
