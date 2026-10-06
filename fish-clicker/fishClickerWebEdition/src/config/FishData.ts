export type Fish = { name: string; weight: number; value: number; triggersFrenzy?: boolean };
export type Area = { name: string; scoreUnlock: number; fish: Fish[] };

export const areaList: Area[] = [
  {
    name: "Area 1", scoreUnlock: 0, fish: [
      { name: "Common Fish", weight: 60, value: 1 },
      { name: "Uncommon Fish", weight: 30, value: 3 },
      { name: "Rare Fish", weight: 10, value: 8 },
      { name: "Frenzy Fish", weight: 2, value: 5, triggersFrenzy: true },
    ]
  },
  {
    name: "Area 2", scoreUnlock: 200, fish: [
      { name: "Uncommon Fish", weight: 50, value: 3 },
      { name: "Rare Fish", weight: 35, value: 8 },
      { name: "Legendary Fish", weight: 15, value: 25 },
      { name: "Frenzy Fish", weight: 2, value: 5, triggersFrenzy: true },
    ]
  },
  {
    name: "Area 3", scoreUnlock: 500, fish: [
      { name: "Rare Fish", weight: 45, value: 8 },
      { name: "Legendary Fish", weight: 40, value: 25 },
      { name: "Mythic Fish", weight: 15, value: 60 },
      { name: "Frenzy Fish", weight: 2, value: 5, triggersFrenzy: true },
    ]
  },
];

export const rarityMultiplier: Record<string, number> = {
  "Common": 1.0,
  "Uncommon": 1.4,
  "Rare": 1.9,
  "Legendary": 2.8,
  "Mythic": 3.5,
  "Frenzy": 2.5,
};
