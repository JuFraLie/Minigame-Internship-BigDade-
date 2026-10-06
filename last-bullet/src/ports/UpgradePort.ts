import type { UpgradeId } from '../core/types.ts';

/**
 * The level-up handshake.
 *
 * The world *offers* three cards and freezes itself until one is accepted; the
 * overlay only ever sees this contract, never the simulation behind it.
 */
export interface UpgradePort {
  /** The cards on offer, or null when no level-up is pending. */
  offers(): readonly UpgradeId[] | null;
  /**
   * Applies the pending level-up.
   *
   * @returns false when nothing is pending or the id was not offered - a stale
   * or duplicated tap must never take a card twice.
   */
  choose(id: UpgradeId): boolean;
}
