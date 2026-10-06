// upgrades.ts — Data-driven upgrade card pool and synergy mechanics.
// Pure game logic: depends only on GameState and configuration types.

import type { Rarity } from '../core/types.ts';

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  /** Max times this upgrade can be picked (defaults to 1 if not specified) */
  maxStacks?: number;
  /** Custom condition to check if upgrade is currently available to pick */
  canOffer?: (state: UpgradeState) => boolean;
  /** Apply effect to the game state */
  apply: (state: UpgradeState) => void;
}

/** Interface of the game state accessible to upgrades */
export interface UpgradeState {
  tickMs: number;
  wallWrap: boolean;
  shedSkinCount: number;
  magnetRange: number;
  compactCoil: boolean;
  comboChain: boolean;
  goldenChance: number;
  phaseTailTime: number; // Duration of phase tail granted on eat
  doubleFeast: boolean;
  rockSmasherCount: number;
  hasDash: boolean;
  longBoi: boolean;
  splitTail: boolean;
  armoredScales: number;
  venomTrail: boolean;
  fastFeast: boolean;
  rerolls: number;
  guaranteedRareNext: boolean;
  chosenUpgrades: string[];
  snakeLength: number;
  shrinkSnake: (segments: number) => void;
}

export const ALL_UPGRADES: Upgrade[] = [
  // ── Common Upgrades ────────────────────────────────────────────────────────
  {
    id: 'slow_time',
    name: 'Slow Time',
    description: 'Game runs 15% slower, giving more time to react.',
    rarity: 'common',
    maxStacks: 3,
    apply: (s) => {
      s.tickMs *= 1.15;
    },
  },
  {
    id: 'magnet',
    name: 'Food Magnet',
    description: 'Food within 3 tiles slowly drifts toward your head.',
    rarity: 'common',
    maxStacks: 2,
    apply: (s) => {
      s.magnetRange += 3;
    },
  },
  {
    id: 'compact_coil',
    name: 'Compact Coil',
    description: 'Grow only once every 2 foods eaten. Stay nimble longer.',
    rarity: 'common',
    maxStacks: 1,
    apply: (s) => {
      s.compactCoil = true;
    },
  },
  {
    id: 'combo_chain',
    name: 'Combo Chain',
    description: 'Eating food in quick succession builds a score multiplier (up to 5x).',
    rarity: 'common',
    maxStacks: 1,
    apply: (s) => {
      s.comboChain = true;
    },
  },
  {
    id: 'golden_apple',
    name: 'Golden Apple',
    description: 'Increases the chance of golden food (3x XP and bonus points) by +25%.',
    rarity: 'common',
    maxStacks: 2,
    apply: (s) => {
      s.goldenChance += 0.25;
    },
  },
  {
    id: 'double_feast',
    name: 'Double Feast',
    description: 'Two food orbs will always be present on the map.',
    rarity: 'common',
    maxStacks: 1,
    apply: (s) => {
      s.doubleFeast = true;
    },
  },
  {
    id: 'rock_smasher',
    name: 'Rock Smasher',
    description: 'Break through up to 2 rocks harmlessly before breaking.',
    rarity: 'common',
    maxStacks: 3,
    apply: (s) => {
      s.rockSmasherCount += 2;
    },
  },
  {
    id: 'extra_reroll',
    name: 'Alchemist Reroll',
    description: 'Gain +2 upgrade rerolls to shape your build.',
    rarity: 'common',
    maxStacks: 3,
    apply: (s) => {
      s.rerolls += 2;
    },
  },

  // ── Rare Upgrades ──────────────────────────────────────────────────────────
  {
    id: 'shed_skin',
    name: 'Shed Skin',
    description: 'Survive one fatal collision by shedding 3 tail segments. Free revive!',
    rarity: 'rare',
    maxStacks: 3,
    apply: (s) => {
      s.shedSkinCount += 1;
    },
  },
  {
    id: 'wall_wrap',
    name: 'Wall Wrap',
    description: 'Slither through outer walls to emerge on the opposite edge safely.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (s) => {
      s.wallWrap = true;
    },
  },
  {
    id: 'phase_tail',
    name: 'Phase Tail',
    description: 'Your tail becomes intangible for 3 seconds every time you eat food.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (s) => {
      s.phaseTailTime = 3.0;
    },
  },
  {
    id: 'dash',
    name: 'Serpent Dash',
    description: 'Dash 3 tiles forward on a 5s cooldown. Can pass through rocks safely!',
    rarity: 'rare',
    maxStacks: 1,
    apply: (s) => {
      s.hasDash = true;
    },
  },
  {
    id: 'long_boi',
    name: 'Long Boi',
    description: 'Every 5 body segments grants an additional +50% score bonus.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (s) => {
      s.longBoi = true;
    },
  },
  {
    id: 'venom_trail',
    name: 'Venom Trail',
    description: 'Your tail leaves a toxic wake that dissolves obstructing rocks over time.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (s) => {
      s.venomTrail = true;
    },
  },
  {
    id: 'armored_scales',
    name: 'Armored Scales',
    description: 'First 3 segments absorb a body collision once per stage.',
    rarity: 'rare',
    maxStacks: 2,
    apply: (s) => {
      s.armoredScales += 3;
    },
  },

  // ── Risk & Reward (Hades II style boons) ──────────────────────────────────
  {
    id: 'fast_feast',
    name: 'Fast Feast',
    description: 'Snake moves 20% faster, but all food grants +50% XP and score.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (s) => {
      s.fastFeast = true;
      s.tickMs *= 0.80; // 20% faster
    },
  },
  {
    id: 'blood_price',
    name: 'Blood Price',
    description: 'Sacrifice 2 body segments right now; your NEXT upgrade is guaranteed Rare!',
    rarity: 'rare',
    maxStacks: 2,
    canOffer: (s) => s.snakeLength > 3,
    apply: (s) => {
      s.shrinkSnake(2);
      s.guaranteedRareNext = true;
    },
  },
];

/**
 * Filter and select 3 random upgrades for the card selection screen.
 */
export function pickRandomUpgrades(
  state: UpgradeState,
  count = 3,
): Upgrade[] {
  // Count current stacks for each upgrade
  const stacks: Record<string, number> = {};
  for (const id of state.chosenUpgrades) {
    stacks[id] = (stacks[id] || 0) + 1;
  }

  // Eligible pool
  const eligible = ALL_UPGRADES.filter((u) => {
    const cur = stacks[u.id] || 0;
    const max = u.maxStacks ?? 1;
    if (cur >= max) return false;
    if (u.canOffer && !u.canOffer(state)) return false;
    return true;
  });

  if (eligible.length <= count) {
    return [...eligible];
  }

  const selected: Upgrade[] = [];
  const pool = [...eligible];

  for (let i = 0; i < count; i++) {
    if (pool.length === 0) break;

    // Check if rare guaranteed
    const mustBeRare = state.guaranteedRareNext && i === 0;
    const rareCandidates = pool.filter((u) => u.rarity === 'rare');

    let pickIndex = -1;
    if (mustBeRare && rareCandidates.length > 0) {
      const choice = rareCandidates[Math.floor(Math.random() * rareCandidates.length)];
      pickIndex = pool.indexOf(choice);
    } else {
      // 75% Common, 25% Rare roll
      const rollRare = Math.random() < 0.25;
      const filtered = pool.filter((u) => (rollRare ? u.rarity === 'rare' : u.rarity === 'common'));
      const candidateList = filtered.length > 0 ? filtered : pool;
      const choice = candidateList[Math.floor(Math.random() * candidateList.length)];
      pickIndex = pool.indexOf(choice);
    }

    if (pickIndex !== -1) {
      selected.push(pool.splice(pickIndex, 1)[0]);
    }
  }

  return selected;
}

/** Check if special synergies are active */
export function getActiveSynergies(chosen: string[]): string[] {
  const active: string[] = [];
  const has = (id: string) => chosen.includes(id);

  if (has('venom_trail') && has('long_boi')) {
    active.push('Toxic Highway: Venom spreads across your whole body length');
  }
  if (has('phase_tail') && has('dash')) {
    active.push('Ghost Serpent: Dash provides complete invulnerability');
  }
  if (has('magnet') && has('combo_chain')) {
    active.push('Black Hole: Combo multiplier supercharges food magnet');
  }
  if (has('shed_skin') && has('split_tail')) {
    active.push('Hydra: Shed tail fragments turn into healing orbs');
  }

  return active;
}
