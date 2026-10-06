export const decaySpeed = 15.0;
export const baseTapStrength = 8.0;
export const tapStrengthUpgradeIncrement = 2.0;

export const baseUpgradeCost = 30;
export const upgradeCostGrowth = 1.6;

export const comboTarget = 5;

export const frenzyDuration = 20.0;
export const frenzyScoreMultiplier = 2.0;

export const roundDuration = 300.0; // 5 minutes
export const baseMaxProgress = 100;

export const biteDelayMin = 1.5;
export const biteDelayRange = 2.5;

// Inputs are ignored for this long after the round ends, so the spam taps of a
// frantic player don't accidentally hit Restart/Exit on the game-over screen.
export const gameOverInputLockMs = 1000;
