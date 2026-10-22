/**
 * Shared app context handed to every scene by the composition root (main.ts).
 *
 * Carries the long-lived adapters: the bridge (launch-once / exit-once guards),
 * the DDA (session-persistent difficulty), the event bus and the RNG/clock.
 * Scenes never construct adapters themselves.
 */

import type { GameSignalsPort, ClockPort, RandomPort } from '../domain/ports.ts';
import type { DdaController } from '../domain/dda/DdaController.ts';
import type { EventBus } from '../adapters/events/EventBus.ts';

export interface AppContext {
    bridge: GameSignalsPort;
    dda: DdaController;
    bus: EventBus;
    random: RandomPort;
    clock: ClockPort;
    /** Final result of the last finished round — used by the exit payload. */
    lastWin: boolean;
    lastScore: number;
}
