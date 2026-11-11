import type { PlayerStrategyPort } from '../app/ports.ts';
import { upgradeCost } from '../domain/economy.ts';
import { TOWER_SPECS, type GameCommand, type RoundSnapshot, type TowerType } from '../domain/types.ts';

/**
 * Bots that drive the simulation through `PlayerStrategyPort` — the same port the input
 * adapter feeds — so balance runs and smoke tests need no screen at all.
 */

/**
 * The reference player: fills every spot (frost first for the slow, then cannon, then
 * dart), upgrades once nothing affordable fits, and calls every wave early for the gold.
 *
 * Deterministic on purpose: the same level always plays out the same way, which is what
 * makes the smoke tests and the balance numbers reproducible.
 */
export function createScriptedBot(spotCount: number): PlayerStrategyPort {
    return {
        decide(snapshot: RoundSnapshot): readonly GameCommand[] {
            if (snapshot.phase !== 'playing') return [];

            const commands: GameCommand[] = [];
            const occupied = new Set(snapshot.towers.map((tower) => tower.spotId));
            let gold = snapshot.gold;
            let hasFrost = snapshot.towers.some((tower) => tower.type === 'frost');

            const build = (spotId: number, tower: TowerType): void => {
                commands.push({ kind: 'build', spotId, tower });
                gold -= TOWER_SPECS[tower].cost;
                occupied.add(spotId);
                if (tower === 'frost') hasFrost = true;
            };

            // 1. Fill the board. Frost first: a 40% slow makes every other tower better.
            for (let spotId = 0; spotId < spotCount; spotId++) {
                if (occupied.has(spotId)) continue;
                if (!hasFrost && gold >= TOWER_SPECS.frost.cost) {
                    build(spotId, 'frost');
                } else if (gold >= TOWER_SPECS.cannon.cost) {
                    build(spotId, 'cannon');
                } else if (gold >= TOWER_SPECS.dart.cost) {
                    build(spotId, 'dart');
                } else {
                    break;
                }
            }

            // 2. Nothing left to buy on the board? Push the cheapest affordable upgrade.
            if (commands.length === 0) {
                for (const tower of snapshot.towers) {
                    if (tower.level >= 3) continue;
                    const cost = upgradeCost(tower.type, tower.level + 1);
                    if (gold >= cost) {
                        commands.push({ kind: 'upgrade', towerId: tower.id });
                        gold -= cost;
                        break;
                    }
                }
            }

            // 3. Otherwise the gap is just waiting: call it and take the gold.
            if (commands.length === 0 && (snapshot.waveState === 'gap' || snapshot.waveState === 'grace')) {
                commands.push({ kind: 'callWave' });
            }

            return commands;
        },
    };
}

/**
 * A deliberately bad player: builds a single dart, never upgrades, never calls a wave.
 * Used to prove that a high level is genuinely lost by an unprepared defence.
 */
export function createWeakBot(): PlayerStrategyPort {
    let built = false;
    return {
        decide(snapshot: RoundSnapshot): readonly GameCommand[] {
            if (snapshot.phase !== 'playing' || built) return [];
            if (snapshot.gold < TOWER_SPECS.dart.cost) return [];
            built = true;
            const spotId = snapshot.towers.length === 0 ? 0 : -1;
            if (spotId < 0) return [];
            return [{ kind: 'build', spotId, tower: 'dart' }];
        },
    };
}
