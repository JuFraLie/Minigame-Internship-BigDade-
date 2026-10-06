import { Fish, Area, areaList, rarityMultiplier } from '../config/FishData';
import { baseUpgradeCost, upgradeCostGrowth } from '../config/GameConfig';

export function randomFish(area: Area): Fish {
  const list = area.fish;
  let totalWeight = list.reduce((sum, f) => sum + f.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  let cumulative = 0;
  for (const f of list) {
    cumulative += f.weight;
    if (roll < cumulative) return f;
  }
  return list[0];
}

export function getRarityMultiplier(fishName: string): number {
  for (const r in rarityMultiplier) {
    if (fishName.startsWith(r)) return rarityMultiplier[r];
  }
  return 1.0;
}

export function getRarityColor(name: string): string {
  if (name.startsWith("Frenzy")) return "#00FFFF";
  if (name.startsWith("Legendary") || name.startsWith("Mythic")) return "#FFD700";
  if (name.startsWith("Rare")) return "#9370DB";
  if (name.startsWith("Uncommon")) return "#90EE90";
  return "#FFFFFF";
}

export function getUpgradeCost(upgradeLevel: number): number {
  return Math.floor(baseUpgradeCost * Math.pow(upgradeCostGrowth, upgradeLevel));
}

export function getUnlockRequirement(currentArea: number): { nextArea: Area; nextIndex: number } {
  const nextIndex = (currentArea + 1) % areaList.length;
  return { nextArea: areaList[nextIndex], nextIndex };
}
