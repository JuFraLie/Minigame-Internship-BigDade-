import type {
  ClashTiedEvent,
  EnemyDefeatedEvent,
  HeartLostEvent,
  RunEndedEvent,
  SignRevealedEvent,
} from '../core/types.ts';

/**
 * Outbound events emitted by the game world.
 *
 * The renderer and the host bridge both react to these; neither of them is
 * allowed to push anything back in.
 */
export interface GameEventsPort {
  /** Fires for every tap that is accepted, before any other event of that tap. */
  onSignRevealed(event: SignRevealedEvent): void;
  /** The enemy was beaten: points were scored and a new enemy steps in. */
  onEnemyDefeated(event: EnemyDefeatedEvent): void;
  /** A heart was spent. `runOver` is true when it was the last one. */
  onHeartLost(event: HeartLostEvent): void;
  /** Nothing changed; the enemy re-rolls. */
  onClashTied(event: ClashTiedEvent): void;
  /** Fires exactly once per run, when the Result Panel appears. */
  onRunEnded(event: RunEndedEvent): void;
}
