import { state, Status } from '../core/GameState';
import { resetGame, startWaiting, doTap, tryUpgrade, tryNextArea } from '../core/FishingFSM';
import { webviewSignalLaunch, webviewSignalExit, webviewSignalStartRound } from '../platform/MpBridge';
import { triggerTapBounce } from '../render/VisualFX';
import { setLastMessage } from '../render/layers/UILayer';
import { getUnlockRequirement } from '../core/FishingMechanics';
import { playSound, playAreaMusic } from '../audio/AudioManager';

let hasExited = false;
let hasLaunched = false;

export function handleFirstInteraction(): void {
  playAreaMusic(state.currentArea);
}

/** Leaves the title screen and starts the round (press-to-start). */
export function handleStartTap(): void {
  if (state.status !== Status.READY) return;
  startWaiting();
  if (!hasLaunched) {
    hasLaunched = true;
    webviewSignalLaunch();
  }
  webviewSignalStartRound();
}

export function handleRestartTap(): void {
  resetGame();
  webviewSignalStartRound();
}

export function handleExitTap(): void {
  if (hasExited) return;
  hasExited = true;
  // Endless game: no losing path, so the last round counts as a win.
  webviewSignalExit(true, state.score);
}

export function handleNextAreaTap(): void {
  const { nextArea } = getUnlockRequirement(state.currentArea);
  const unlocked = tryNextArea();
  if (unlocked) {
    playAreaMusic(state.currentArea);
  } else {
    const missing = nextArea.scoreUnlock - state.score;
    setLastMessage(`Need ${missing} score to reach ${nextArea.name}`, "#FF0000", 2.0);
  }
}

export function handleUpgradeTap(): void {
  const success = tryUpgrade();
  if (success) {
    playSound('upgrade');
    setLastMessage(`Pancing Upgrade to Lv ${state.upgradeLevel}`, "#00FF00", 1.0);
  } else {
    setLastMessage(`Not enough score to upgrade`, "#FF0000", 2.0);
  }
}

export function handleFishTap(): void {
  if (state.status === Status.BITING) playSound('tap');
  doTap();
  triggerTapBounce();
}
