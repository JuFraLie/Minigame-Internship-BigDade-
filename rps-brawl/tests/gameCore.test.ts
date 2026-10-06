import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GameCore } from '../src/core/GameCore.ts';
import { RandomAdapter } from '../src/adapters/random/RandomAdapter.ts';
import {
  BASE_POINTS,
  MULTIPLIER_CAP,
  beats,
  multiplierForStreak,
  pointsForStreak,
  resolveClash,
} from '../src/core/RpsRules.ts';
import { CardTapInput } from '../src/adapters/input/CardTapInput.ts';
import type { GameEventsPort } from '../src/ports/GameEventsPort.ts';
import type { RandomPort } from '../src/ports/RandomPort.ts';
import type {
  ClashTiedEvent,
  EnemyDefeatedEvent,
  HeartLostEvent,
  RunEndedEvent,
  Sign,
  SignRevealedEvent,
} from '../src/core/types.ts';

const SIGNS: Sign[] = ['ROCK', 'PAPER', 'SCISSORS'];

// ── Test doubles ─────────────────────────────────────────────────────────────

/** Records every event the game world emits. */
class Recorder implements GameEventsPort {
  readonly revealed: SignRevealedEvent[] = [];
  readonly defeats: EnemyDefeatedEvent[] = [];
  readonly losses: HeartLostEvent[] = [];
  readonly ties: ClashTiedEvent[] = [];
  readonly ends: RunEndedEvent[] = [];

  onSignRevealed(event: SignRevealedEvent): void { this.revealed.push(event); }
  onEnemyDefeated(event: EnemyDefeatedEvent): void { this.defeats.push(event); }
  onHeartLost(event: HeartLostEvent): void { this.losses.push(event); }
  onClashTied(event: ClashTiedEvent): void { this.ties.push(event); }
  onRunEnded(event: RunEndedEvent): void { this.ends.push(event); }
}

/** Hands out a fixed script of enemy picks, then repeats the last one. */
class ScriptedRandom implements RandomPort {
  private readonly picks: Sign[];
  private index = 0;

  constructor(picks: Sign[]) {
    this.picks = picks;
  }

  pickSign(): Sign {
    const sign = this.picks[Math.min(this.index, this.picks.length - 1)];
    this.index += 1;
    return sign;
  }

  pickFloat(): number { return 0.5; }
  pickInt(min: number): number { return min; }
}

function makeCore(picks: Sign[]): { core: GameCore; rec: Recorder } {
  const rec = new Recorder();
  const core = new GameCore(rec, new ScriptedRandom(picks));
  return { core, rec };
}

/** Play one accepted pick and let the reveal finish. */
function round(core: GameCore, rec: Recorder, sign: Sign): void {
  assert.equal(core.pickSign(sign), true, 'a pick during CHOOSING must be accepted');
  core.completeReveal();
  assert.equal(rec.ends.length, core.getSnapshot().phase === 'ENDED' ? 1 : 0);
}

// ── RpsRules ─────────────────────────────────────────────────────────────────

describe('RpsRules', () => {
  test('the triangle resolves all 9 pairs correctly', () => {
    const wins: Array<[Sign, Sign]> = [
      ['ROCK', 'SCISSORS'],
      ['SCISSORS', 'PAPER'],
      ['PAPER', 'ROCK'],
    ];
    const losses: Array<[Sign, Sign]> = [
      ['ROCK', 'PAPER'],
      ['PAPER', 'SCISSORS'],
      ['SCISSORS', 'ROCK'],
    ];

    for (const [player, enemy] of wins) {
      assert.equal(resolveClash(player, enemy), 'WIN', `${player} beats ${enemy}`);
      assert.equal(beats(player, enemy), true);
    }
    for (const [player, enemy] of losses) {
      assert.equal(resolveClash(player, enemy), 'LOSE', `${player} loses to ${enemy}`);
      assert.equal(beats(player, enemy), false);
    }
    for (const sign of SIGNS) {
      assert.equal(resolveClash(sign, sign), 'TIE', `${sign} ties ${sign}`);
    }
  });

  test('multiplier climbs x1..x4 then caps at x5', () => {
    assert.equal(multiplierForStreak(0), 1);
    assert.equal(multiplierForStreak(1), 1);
    assert.equal(multiplierForStreak(2), 2);
    assert.equal(multiplierForStreak(3), 3);
    assert.equal(multiplierForStreak(4), 4);
    assert.equal(multiplierForStreak(5), 5);
    assert.equal(multiplierForStreak(6), 5);
    assert.equal(multiplierForStreak(50), MULTIPLIER_CAP);
  });

  test('points are 100 x multiplier', () => {
    assert.equal(pointsForStreak(1), BASE_POINTS);
    assert.equal(pointsForStreak(3), 300);
    assert.equal(pointsForStreak(9), 500);
  });
});

// ── GameCore: clash outcomes ─────────────────────────────────────────────────

describe('GameCore clash resolution', () => {
  test('all 9 player/enemy pairs produce the right result and reveal both signs', () => {
    let wins = 0;
    let losses = 0;
    let ties = 0;

    for (const player of SIGNS) {
      for (const enemy of SIGNS) {
        const { core, rec } = makeCore([enemy]);
        assert.equal(core.pickSign(player), true);

        assert.equal(rec.revealed.length, 1);
        assert.equal(rec.revealed[0].playerSign, player);
        assert.equal(rec.revealed[0].enemySign, enemy);
        assert.equal(rec.revealed[0].result, resolveClash(player, enemy));

        if (rec.revealed[0].result === 'WIN') wins++;
        if (rec.revealed[0].result === 'LOSE') losses++;
        if (rec.revealed[0].result === 'TIE') ties++;
      }
    }

    assert.equal(wins, 3);
    assert.equal(losses, 3);
    assert.equal(ties, 3);
  });

  test('a Win defeats the enemy and starts a new one', () => {
    const { core, rec } = makeCore(['SCISSORS', 'PAPER']);
    assert.equal(core.getSnapshot().enemyId, 1);

    round(core, rec, 'ROCK'); // ROCK beats SCISSORS
    assert.equal(rec.defeats.length, 1);
    assert.equal(core.getSnapshot().enemyId, 2, 'a win must bring in a new enemy');
  });

  test('a Lose keeps the same enemy and re-rolls its pick', () => {
    const { core, rec } = makeCore(['PAPER', 'SCISSORS']);

    round(core, rec, 'ROCK'); // ROCK loses to PAPER
    assert.equal(core.getSnapshot().enemyId, 1, 'the same enemy stays');
    assert.equal(rec.losses.length, 1);

    core.pickSign('PAPER'); // PAPER loses to SCISSORS
    assert.equal(rec.revealed[1].enemySign, 'SCISSORS', 'the enemy must have re-picked');
  });

  test('a Tie keeps the same enemy and re-rolls its pick', () => {
    const { core, rec } = makeCore(['ROCK', 'PAPER']);

    round(core, rec, 'ROCK'); // tie
    assert.equal(rec.ties.length, 1);
    assert.equal(core.getSnapshot().enemyId, 1);

    core.pickSign('PAPER');
    assert.equal(rec.revealed[1].enemySign, 'PAPER', 'the enemy must have re-picked');
  });
});

// ── GameCore: streak, multiplier, score ──────────────────────────────────────

describe('GameCore scoring', () => {
  test('a Tie keeps the streak, a Lose resets it to 0', () => {
    const { core, rec } = makeCore(['SCISSORS', 'PAPER', 'SCISSORS', 'ROCK']);

    round(core, rec, 'ROCK'); // win  → streak 1
    assert.equal(core.getSnapshot().streak, 1);

    core.pickSign('PAPER'); // PAPER vs PAPER → tie
    assert.equal(core.getSnapshot().streak, 1, 'a tie must keep the streak');
    core.completeReveal();

    core.pickSign('PAPER'); // PAPER vs SCISSORS → lose
    assert.equal(core.getSnapshot().streak, 0, 'a loss must reset the streak');
    assert.equal(core.getSnapshot().multiplier, 1);
    core.completeReveal();

    core.pickSign('PAPER'); // PAPER vs ROCK → win
    assert.equal(core.getSnapshot().streak, 1, 'the streak restarts from 1');
  });

  test('multiplier is x1, x2, x3, x4, then x5 and capped', () => {
    const { core, rec } = makeCore(['SCISSORS']);
    const multipliers: number[] = [];

    for (let i = 0; i < 7; i++) {
      core.pickSign('ROCK'); // always a win
      multipliers.push(core.getSnapshot().multiplier);
      core.completeReveal();
    }

    assert.deepEqual(multipliers, [1, 2, 3, 4, 5, 5, 5]);
    assert.equal(rec.defeats[4].points, 500);
    assert.equal(rec.defeats[5].points, 500);
  });

  test('the design document example (win, win, lose, win, win, win) scores 900', () => {
    const enemyPicks: Sign[] = ['SCISSORS', 'SCISSORS', 'PAPER', 'SCISSORS', 'SCISSORS', 'SCISSORS'];
    const { core, rec } = makeCore(enemyPicks);
    const playerPicks: Sign[] = ['ROCK', 'ROCK', 'ROCK', 'ROCK', 'ROCK', 'ROCK'];

    let score = 0;
    for (const pick of playerPicks) {
      core.pickSign(pick);
      score = core.getSnapshot().score;
      core.completeReveal();
    }

    assert.equal(score, 900, '100 + 200 + 100 + 200 + 300 = 900');
    assert.equal(rec.defeats.length, 5);
    assert.equal(core.getSnapshot().bestStreak, 3);
    assert.equal(core.getSnapshot().streak, 3);
  });
});

// ── GameCore: hearts and run end ─────────────────────────────────────────────

describe('GameCore hearts and run end', () => {
  test('starts with 5 hearts and spends 1 per Lose', () => {
    const { core, rec } = makeCore(['PAPER']);
    assert.equal(core.getSnapshot().hearts, 5);
    assert.equal(core.getSnapshot().maxHearts, 5);

    core.pickSign('ROCK'); // lose
    assert.equal(core.getSnapshot().hearts, 4);
    assert.equal(rec.losses[0].heartsLeft, 4);
    assert.equal(rec.losses[0].runOver, false);
  });

  test('RunEnded fires exactly once at 0 hearts and no intents are accepted afterwards', () => {
    const { core, rec } = makeCore(['PAPER']);

    for (let i = 0; i < 5; i++) {
      core.pickSign('ROCK'); // five losses
      assert.equal(core.pickSign('ROCK'), false, 'locked while the reveal plays');
      core.completeReveal();
    }

    assert.equal(core.getSnapshot().hearts, 0);
    assert.equal(core.getSnapshot().phase, 'ENDED');
    assert.equal(rec.ends.length, 1, 'RunEnded must fire exactly once');
    assert.equal(rec.ends[0].score, core.getSnapshot().score);
    assert.equal(rec.ends[0].bestStreak, core.getSnapshot().bestStreak);

    // Nothing more is accepted, ever.
    assert.equal(core.pickSign('ROCK'), false);
    assert.equal(core.pickSign('PAPER'), false);
    assert.equal(core.completeReveal(), false);
    assert.equal(rec.ends.length, 1);
    assert.equal(rec.revealed.length, 5, 'no extra reveals after the run');
  });

  test('RunEnded does not fire while hearts remain', () => {
    const { core, rec } = makeCore(['PAPER']);
    for (let i = 0; i < 4; i++) {
      core.pickSign('ROCK');
      core.completeReveal();
    }
    assert.equal(core.getSnapshot().hearts, 1);
    assert.equal(rec.ends.length, 0);
  });

  test('completeReveal only advances while a reveal is playing', () => {
    const { core } = makeCore(['SCISSORS']);
    assert.equal(core.completeReveal(), false, 'nothing to finish before a tap');
    core.pickSign('ROCK');
    assert.equal(core.completeReveal(), true);
    assert.equal(core.completeReveal(), false, 'already back to CHOOSING');
  });
});

// ── Determinism of the seeded random ─────────────────────────────────────────

describe('RandomAdapter', () => {
  test('is reproducible for a given seed', () => {
    const a = new RandomAdapter(1234);
    const b = new RandomAdapter(1234);
    for (let i = 0; i < 100; i++) assert.equal(a.pickSign(), b.pickSign());
  });

  test('enemy picks over 30,000 seeded samples are close to one third each', () => {
    const tally: Record<Sign, number> = { ROCK: 0, PAPER: 0, SCISSORS: 0 };
    const player = new RandomAdapter(20261005);
    let seed = 1;
    let samples = 0;

    while (samples < 30000) {
      const rec = new Recorder();
      const core = new GameCore(rec, new RandomAdapter(seed++));

      for (let guard = 0; guard < 8 && samples < 30000; guard++) {
        const accepted = core.pickSign(player.pickSign());
        if (accepted) {
          tally[rec.revealed[rec.revealed.length - 1].enemySign] += 1;
          samples += 1;
        }
        core.completeReveal();
        if (core.getSnapshot().phase === 'ENDED') break;
      }
    }

    assert.equal(samples, 30000);
    for (const sign of SIGNS) {
      const share: number = tally[sign] / samples;
      assert.ok(
        Math.abs(share - 1 / 3) < 0.02,
        `${sign} share ${(share * 100).toFixed(2)}% should be within 2% of 33.33%`,
      );
    }
  });
});

// ── Headless simulation ──────────────────────────────────────────────────────

describe('headless runs', () => {
  test('1,000 seeded runs with random player finishes complete without errors', () => {
    const player = new RandomAdapter(987654321);

    for (let run = 0; run < 1000; run++) {
      const rec = new Recorder();
      const core = new GameCore(rec, new RandomAdapter(run + 1));
      let picks = 0;

      while (core.getSnapshot().phase !== 'ENDED' && picks < 200) {
        if (core.pickSign(player.pickSign())) picks += 1;
        core.completeReveal();
      }

      assert.equal(core.getSnapshot().phase, 'ENDED', `run ${run} must end`);
      assert.equal(rec.ends.length, 1, `run ${run} must end exactly once`);
      assert.ok(picks >= 5, `run ${run} needs at least 5 accepted picks`);
      assert.equal(core.getSnapshot().hearts, 0);
      assert.ok(core.getSnapshot().score >= 0);
      assert.equal(rec.revealed.length, picks);

      // Score must equal the sum of the awarded points.
      const expected = rec.defeats.reduce((total, event) => total + event.points, 0);
      assert.equal(core.getSnapshot().score, expected, `run ${run} score accounting`);
      assert.ok(rec.defeats.every((event) => event.multiplier <= MULTIPLIER_CAP));
    }
  });
});

// ── Input adapter: screen space → game world ────────────────────────────────

describe('CardTapInput', () => {
  const layout = {
    regions: [
      { sign: 'ROCK' as const, x: 0, y: 0, width: 100, height: 150 },
      { sign: 'PAPER' as const, x: 110, y: 0, width: 100, height: 150 },
      { sign: 'SCISSORS' as const, x: 220, y: 0, width: 100, height: 150 },
    ],
  };

  test('converts a screen point into the matching PickSign intent', () => {
    const { core, rec } = makeCore(['SCISSORS']);
    const input = new CardTapInput(core);

    assert.equal(input.tapAt(50, 75, layout), 'ROCK');
    assert.equal(rec.revealed[0].playerSign, 'ROCK');

    core.completeReveal();
    assert.equal(input.tapAt(150, 20, layout), 'PAPER');
    assert.equal(rec.revealed[1].playerSign, 'PAPER');
  });

  test('points between and outside the cards hit nothing', () => {
    const { core } = makeCore(['SCISSORS']);
    const input = new CardTapInput(core);

    assert.equal(input.tapAt(105, 75, layout), null, 'the gap between cards');
    assert.equal(input.tapAt(500, 500, layout), null, 'off the layout');
    assert.equal(input.tapAt(-1, -1, layout), null, 'above/left of everything');
  });

  test('a double tap during the reveal is ignored', () => {
    const { core, rec } = makeCore(['PAPER']);
    const input = new CardTapInput(core);

    assert.equal(input.tapAt(50, 75, layout), 'ROCK'); // a loss — reveal starts
    assert.equal(input.tapAt(50, 75, layout), null, 'second tap must be dropped');
    assert.equal(rec.revealed.length, 1);

    core.completeReveal();
    assert.equal(input.tapAt(50, 75, layout), 'ROCK', 'input is unlocked again');
    assert.equal(rec.revealed.length, 2);
  });
});
