import type { GameEventsPort } from '../ports/GameEventsPort.ts';
import type {
  ClashTiedEvent,
  EnemyDefeatedEvent,
  HeartLostEvent,
  RunEndedEvent,
  SignRevealedEvent,
} from '../core/types.ts';

/**
 * Delivers one game event to several listeners (the renderer and the host
 * reporter) without either of them knowing about the other.
 */
export class FanOutEvents implements GameEventsPort {
  private readonly listeners: ReadonlyArray<GameEventsPort>;

  constructor(listeners: ReadonlyArray<GameEventsPort>) {
    this.listeners = listeners;
  }

  onSignRevealed(event: SignRevealedEvent): void {
    for (const listener of this.listeners) listener.onSignRevealed(event);
  }

  onEnemyDefeated(event: EnemyDefeatedEvent): void {
    for (const listener of this.listeners) listener.onEnemyDefeated(event);
  }

  onHeartLost(event: HeartLostEvent): void {
    for (const listener of this.listeners) listener.onHeartLost(event);
  }

  onClashTied(event: ClashTiedEvent): void {
    for (const listener of this.listeners) listener.onClashTied(event);
  }

  onRunEnded(event: RunEndedEvent): void {
    for (const listener of this.listeners) listener.onRunEnded(event);
  }
}
