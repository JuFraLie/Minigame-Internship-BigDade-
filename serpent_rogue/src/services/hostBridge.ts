// hostBridge.ts — adapter: exposes the host shell through the game's bridge port.
//
// `services/MpBridge.ts` stays the only file that touches `window.MpPostMessage`
// (AGENTS.md §4.2); this adapter adds the ordering guarantees the rules ask for —
// `launch` at most once per session, `endRound` at most once per round, `exit` at
// most once per session — so a double tap on a button can never leak a duplicate
// signal.

import type { GameBridge } from '../game/game.ts';
import {
  webviewSignalEndRound,
  webviewSignalExit,
  webviewSignalLaunch,
  webviewSignalStartRound,
} from './MpBridge.ts';

export function createHostBridge(): GameBridge {
  let launchSent = false;
  let exitSent = false;
  let roundEnded = false;

  return {
    launch(): void {
      if (launchSent) return;
      launchSent = true;
      webviewSignalLaunch();
    },
    startRound(): void {
      roundEnded = false;
      webviewSignalStartRound();
    },
    endRound(win: boolean, score: number): void {
      if (roundEnded) return;
      roundEnded = true;
      webviewSignalEndRound(win, score);
    },
    exit(win: boolean, score: number): void {
      if (exitSent) return;
      exitSent = true;
      webviewSignalExit(win, score);
    },
  };
}
