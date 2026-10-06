import { Fish } from '../config/FishData';
import { baseTapStrength, roundDuration, baseMaxProgress } from '../config/GameConfig';

export enum Status { WAITING, BITING, GAMEOVER, READY }

export const state = {
  status: Status.READY,
  biteTimer: 0.0,
  nextBiteTime: 0.0,
  progress: 0.0,
  maxProgress: baseMaxProgress,
  tapStrength: baseTapStrength,
  score: 0,
  upgradeLevel: 0,
  comboCount: 0,
  hitZeroThisBite: false,
  hasTapped: false,
  frenzyActive: false,
  frenzyTimeLeft: 0.0,
  currentArea: 0,
  currentFish: null as Fish | null,
  gameTimeLeft: roundDuration,
  gameOverAt: 0,
  lastCatchMessage: "",
  lastCatchColor: "",
  catchMessageTimer: 0,
};
