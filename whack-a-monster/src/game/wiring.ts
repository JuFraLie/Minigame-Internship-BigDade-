import { RoundSession } from '../app/roundSession.ts';
import type { AudioPort, BridgePort } from '../core/ports.ts';
import { hostBridge } from '../platform/hostBridge.ts';
import { synthAudio } from '../platform/synthAudio.ts';

/**
 * Composition root of the app layer (AGENTS.md §4.3: wiring happens outside the
 * components).
 *
 * Scenes never name `hostBridge` or `synthAudio` themselves — they ask for the ports bound
 * here, so swapping either adapter is a one-line change in this file and nothing else.
 */

/** Host signals, channel `gameState`. */
export const bridgePort: BridgePort = hostBridge;

/** Procedural sound cues. */
export const audioPort: AudioPort = synthAudio;

/** Builds a fresh round bound to the ports above. */
export const createRoundSession = (): RoundSession =>
    new RoundSession({ bridge: bridgePort, audio: audioPort });
