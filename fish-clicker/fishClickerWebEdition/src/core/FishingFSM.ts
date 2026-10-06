import { state, Status } from './GameState';
import { areaList } from '../config/FishData';
import {
  decaySpeed, comboTarget, frenzyDuration, frenzyScoreMultiplier,
  tapStrengthUpgradeIncrement, biteDelayMin, biteDelayRange,
  baseMaxProgress, roundDuration, baseTapStrength
} from '../config/GameConfig';
import { randomFish, getRarityMultiplier, getRarityColor, getUpgradeCost, getUnlockRequirement } from './FishingMechanics';
import { webviewSignalEndRound } from '../platform/MpBridge';
import { playSound, stopFrenzySound, stopReel, playReel, pauseBackgroundMusic, resumeBackgroundMusic, ensureAreaMusic } from '../audio/AudioManager';

export function resetGame(): void {
  resetRound();
  startWaiting();
  ensureAreaMusic(state.currentArea);
}

/** Puts the game into the "press to start" title state (score/time not ticking yet). */
export function prepareStartScreen(): void {
  resetRound();
  state.status = Status.READY;
}

function resetRound(): void {
  state.score = 0;
  state.upgradeLevel = 0;
  state.tapStrength = baseTapStrength;
  state.comboCount = 0;
  state.frenzyActive = false;
  state.currentArea = 0;
  state.gameTimeLeft = roundDuration;
  state.lastCatchMessage = "";
  stopFrenzySound();
  stopReel();
}

export function startWaiting(): void {
  state.status = Status.WAITING;
  state.biteTimer = 0.0;
  state.nextBiteTime = biteDelayMin + Math.random() * biteDelayRange;
  state.progress = 0.0;
  stopReel();
}

export function startBiting(): void {
  state.status = Status.BITING;
  state.hitZeroThisBite = false;
  state.hasTapped = false;
  state.currentFish = randomFish(areaList[state.currentArea]);
  state.maxProgress = baseMaxProgress * getRarityMultiplier(state.currentFish.name);
  state.progress = 0.0;
  playReel();
}

export function startFrenzy(): void {
  state.frenzyActive = true;
  state.frenzyTimeLeft = frenzyDuration;
  state.comboCount = 0;
  playSound('frenzy');
  pauseBackgroundMusic();
}

export function doTap(): void {
  if (state.status !== Status.BITING) return;
  state.progress += state.tapStrength;
  state.hasTapped = true;
  if (state.progress >= state.maxProgress) {
    catchFish();
  }
}

function catchFish(): void {
  const fish = state.currentFish;
  if (!fish) return;
  let earned = fish.value;
  if (state.frenzyActive) earned = Math.floor(earned * frenzyScoreMultiplier);
  state.score += earned;
  playSound('catch');

  state.lastCatchMessage = `${fish.name} (+${earned})`;
  state.lastCatchColor = getRarityColor(fish.name);
  state.catchMessageTimer = 1.0;

  if (fish.triggersFrenzy) {
    startFrenzy();
  } else if (!state.frenzyActive) {
    if (state.hitZeroThisBite) {
      state.comboCount = 0;
    } else {
      state.comboCount += 1;
      if (state.comboCount >= comboTarget) startFrenzy();
    }
  }

  if (state.frenzyActive) {
    startBiting();
  } else {
    startWaiting();
  }
}

export function tryUpgrade(): boolean {
  const cost = getUpgradeCost(state.upgradeLevel);
  if (state.score >= cost) {
    state.upgradeLevel++;
    state.tapStrength += tapStrengthUpgradeIncrement;
    return true;
  }
  return false;
}

export function tryNextArea(): boolean {
  const { nextArea, nextIndex } = getUnlockRequirement(state.currentArea);
  if (state.score >= nextArea.scoreUnlock) {
    state.currentArea = nextIndex;
    return true;
  }
  return false;
}

export function tick(delta: number): void {
  // Round has not started yet (title screen) or it is already over
  if (state.status === Status.GAMEOVER || state.status === Status.READY) return;

  const dt = Math.min(delta, 0.2);

  state.gameTimeLeft -= dt;
  if (state.gameTimeLeft <= 0) {
    state.status = Status.GAMEOVER;
    state.gameOverAt = Date.now();
    stopReel();
    if (state.frenzyActive) {
      state.frenzyActive = false;
      stopFrenzySound();
      resumeBackgroundMusic();
    }
    // Endless game: the player has no losing path, so the round reports a win.
    webviewSignalEndRound(true, state.score);
  }

  if (state.status === Status.WAITING) {
    state.biteTimer += dt;
    if (state.biteTimer >= state.nextBiteTime) {
      startBiting();
    }
  } else if (state.status === Status.BITING) {
    state.progress = Math.max(0, state.progress - decaySpeed * dt);
    if (state.progress <= 0 && state.hasTapped) {
      state.hitZeroThisBite = true;
    }
  }

  if (state.frenzyActive) {
    state.frenzyTimeLeft -= dt;
    if (state.frenzyTimeLeft <= 0) {
      state.frenzyActive = false;
      stopFrenzySound();
      resumeBackgroundMusic();
    }
  }

  if (state.catchMessageTimer > 0) {
    state.catchMessageTimer -= dt;
  }
}
