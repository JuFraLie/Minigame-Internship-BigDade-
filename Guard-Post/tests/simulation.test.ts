import test from 'node:test';
import assert from 'node:assert/strict';

import { ddaScoreMultiplier } from '../src/domain/dda.ts';
import { earlyCallBonus, startingGold, waveClearBonus } from '../src/domain/economy.ts';
import { isInsideGateCastle } from '../src/domain/maps.ts';
import { Simulation } from '../src/domain/simulation.ts';
import { waveClearScore } from '../src/domain/score.ts';
import { ProceduralMapSource } from '../src/adapters/maps/ProceduralMapSource.ts';
import { createScriptedBot } from '../src/testing/bots.ts';
import {
    GRACE_SECONDS,
    SIM_DT,
    STARTING_LIVES,
    WAVE_GAP_SECONDS,
    wavesForLevel,
    type RoundEvent,
} from '../src/domain/types.ts';

/**
 * The round itself: grace, waves, leaks, defeat, commands — driven through the public
 * surface (`step`, commands, snapshot, events) exactly as the scenes and bots do.
 */

/** One map source for every test: the same layout each run, like the harness uses. */
const MAP_SOURCE = new ProceduralMapSource();

/** Runs `seconds` of simulation at the fixed step rate. */
function run(sim: Simulation, seconds: number): void {
    const steps = Math.round(seconds / SIM_DT);
    for (let i = 0; i < steps; i++) sim.step();
}

/** Drains the events emitted since the last drain. */
function drain(sim: Simulation): RoundEvent[] {
    const events: RoundEvent[] = [];
    sim.drainEvents(events);
    return events;
}

test('a fresh round starts in grace with the documented numbers', () => {
    const sim = new Simulation(1, MAP_SOURCE);

    assert.equal(sim.phase, 'playing');
    assert.equal(sim.waveState, 'grace');
    assert.equal(sim.wave, 1);
    assert.equal(sim.lives, STARTING_LIVES);
    assert.equal(sim.gold, startingGold(1));
    assert.equal(sim.score, 0);
    assert.ok(Math.abs(sim.pendingSeconds - GRACE_SECONDS) < 1e-9, `grace was ${sim.pendingSeconds}`);
});

test('the grace period expires into wave 1 on its own', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    drain(sim);

    run(sim, 9);
    assert.equal(sim.waveState, 'grace', 'the wave must not start early');
    assert.ok(sim.pendingSeconds > 0.5);

    run(sim, 1.2);
    assert.equal(sim.waveState, 'active');
    assert.equal(sim.wave, 1);

    const started = drain(sim).filter((event) => event.type === 'waveStarted');
    assert.equal(started.length, 1);
});

test('the next wave is announced shortly before it starts', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    const events: RoundEvent[] = [];

    for (let i = 0; i < 30 * 12 && sim.waveState !== 'active'; i++) {
        sim.step();
        sim.drainEvents(events);
    }

    const incoming = events.filter((event): event is RoundEvent & { type: 'waveIncoming' } => event.type === 'waveIncoming');
    const started = events.filter((event): event is RoundEvent & { type: 'waveStarted' } => event.type === 'waveStarted');
    assert.equal(incoming.length, 1, 'the incoming banner fires once');
    assert.equal(incoming[0].wave, 1);
    assert.equal(started.length, 1);
    assert.ok(events.indexOf(incoming[0]) < events.indexOf(started[0]), 'the announcement comes before the wave');
});

test('the first interaction starts wave 1 immediately — the grace is for idlers', () => {
    const sim = new Simulation(1, MAP_SOURCE);

    assert.equal(sim.build(0, 'dart'), true);
    assert.equal(sim.waveState, 'active');
    assert.equal(sim.wave, 1);
    assert.equal(sim.pendingSeconds, 0);
});

test('calling the wave during grace starts it for free; during a wave it is refused', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    drain(sim);

    assert.equal(sim.callWave(), true);
    assert.equal(sim.waveState, 'active');
    assert.equal(sim.gold, startingGold(1), 'skipping grace pays nothing and costs nothing');

    assert.equal(sim.callWave(), false);
    const blocked = drain(sim).filter(
        (event): event is RoundEvent & { type: 'blocked' } => event.type === 'blocked',
    );
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].reason, 'noWave');
});

test('a wave with no defence walks through: each leak costs a life, an empty pool loses', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    const events: RoundEvent[] = [];

    for (let i = 0; i < 30 * 400 && sim.phase === 'playing'; i++) {
        sim.step();
        sim.drainEvents(events);
    }

    assert.equal(sim.phase, 'lost');
    assert.ok(sim.lives <= 0, `lives were ${sim.lives}`);

    const leaks = events.filter((event): event is RoundEvent & { type: 'leak' } => event.type === 'leak');
    assert.ok(leaks.length >= STARTING_LIVES, 'the round must last until the lives run out');
    assert.equal(leaks[0].lives, STARTING_LIVES - 1, 'a grunt leaks one life');

    const defeat = events.filter((event): event is RoundEvent & { type: 'defeat' } => event.type === 'defeat');
    assert.equal(defeat.length, 1);
    assert.equal(defeat[0].score, sim.score);

    // After the round the commands are dead: no restart path outside the Result Panel.
    assert.equal(sim.build(1, 'dart'), false);
    assert.equal(sim.callWave(), false);
});

test('a life is spent only when an enemy steps inside the castle box', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    drain(sim);
    sim.callWave();
    const gate = sim.map.waypoints[sim.map.waypoints.length - 1];

    let spent = false;
    for (let i = 0; i < 30 * 90 && !spent; i++) {
        const before = sim.snapshot().enemies.map((enemy) => ({ x: enemy.x, y: enemy.y }));
        const livesBefore = sim.lives;
        sim.step();
        const events = drain(sim);

        if (sim.lives < livesBefore) {
            const leaks = events.filter((event): event is RoundEvent & { type: 'leak' } => event.type === 'leak');
            assert.equal(leaks.length, 1, 'one life drop is one leak');
            assert.ok(
                before.every((enemy) => !isInsideGateCastle(enemy, gate)),
                'no life may be lost while every enemy is still outside the castle',
            );
            spent = true;
        }
    }

    assert.ok(spent, 'an undefended wave must eventually leak');
});

test('clearing a wave pays the bonus, opens the gap, and calling early pays for the skip', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    const bot = createScriptedBot(sim.map.spots.length);
    let cleared: (RoundEvent & { type: 'waveCleared' }) | null = null;
    let raised: Extract<RoundEvent, { type: 'ddaChanged' }> | null = null;

    for (let i = 0; i < 30 * 300 && !cleared; i++) {
        if (i % 15 === 0 && sim.phase === 'playing') {
            for (const command of bot.decide(sim.snapshot())) sim.handle(command);
        }
        sim.step();
        const events = drain(sim);
        cleared = events.find((event): event is RoundEvent & { type: 'waveCleared' } => event.type === 'waveCleared') ?? cleared;
        raised =
            events.find(
                (event): event is Extract<RoundEvent, { type: 'ddaChanged' }> =>
                    event.type === 'ddaChanged' && event.reason === 'clean',
            ) ?? raised;
    }

    assert.ok(cleared, 'the scripted bot never cleared wave 1');
    assert.equal(cleared.bonus, waveClearBonus(1));
    // A clean wave earns DDA tier 1, which pays a better score on that same clear.
    assert.equal(cleared.score, Math.round(waveClearScore(1) * ddaScoreMultiplier(1)));
    assert.ok(raised, 'the clean wave must announce its DDA gain');
    assert.equal(raised.tier, 1);
    assert.equal(raised.multiplier, ddaScoreMultiplier(1));
    assert.equal(sim.ddaTier, 1);
    assert.equal(sim.waveState, 'gap');
    assert.equal(sim.wave, 2);
    assert.ok(Math.abs(sim.pendingSeconds - WAVE_GAP_SECONDS) < 1e-9, `gap was ${sim.pendingSeconds}`);

    // Calling during the gap banks 2 gold per full second left on the clock.
    const gold = sim.gold;
    const pending = sim.pendingSeconds;
    assert.equal(sim.callWave(), true);
    assert.equal(sim.gold, gold + earlyCallBonus(pending));
    assert.equal(sim.waveState, 'active');
    assert.equal(sim.wave, 2);
});

test('a leak drops DDA back to normal immediately', () => {
    const sim = new Simulation(1, MAP_SOURCE, { ddaTier: 5 });
    sim.callWave();

    let reset: Extract<RoundEvent, { type: 'ddaChanged' }> | null = null;
    for (let i = 0; i < 30 * 30 && !reset; i++) {
        sim.step();
        reset =
            drain(sim).find(
                (event): event is Extract<RoundEvent, { type: 'ddaChanged' }> =>
                    event.type === 'ddaChanged' && event.reason === 'leak',
            ) ?? null;
    }

    assert.ok(reset, 'an undefended wave must leak and reset DDA');
    assert.equal(reset.tier, 0);
    assert.equal(reset.multiplier, 1);
    assert.equal(sim.ddaTier, 0);
});

test('enemies spawned at a higher DDA tier are tougher', () => {
    const normal = new Simulation(1, MAP_SOURCE);
    const pushed = new Simulation(1, MAP_SOURCE, { ddaTier: 4 });
    normal.callWave();
    pushed.callWave();
    run(normal, 1);
    run(pushed, 1);

    assert.ok(normal.enemies.length > 0 && pushed.enemies.length > 0);
    assert.ok(pushed.enemies[0].maxHp > normal.enemies[0].maxHp, 'DDA must raise enemy HP');
});

test('a spotless level spikes DDA once per wave and once more for the level', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    const bot = createScriptedBot(sim.map.spots.length);
    const events: RoundEvent[] = [];

    for (let i = 0; i < 30 * 600 && sim.phase === 'playing'; i++) {
        if (i % 15 === 0) {
            for (const command of bot.decide(sim.snapshot())) sim.handle(command);
        }
        sim.step();
        sim.drainEvents(events);
    }

    assert.equal(sim.phase, 'won');
    assert.equal(events.filter((event) => event.type === 'leak').length, 0, 'the bot must stay spotless');
    const spikes = events.filter((event) => event.type === 'ddaChanged' && event.reason === 'clean');
    assert.equal(spikes.length, wavesForLevel(1) + 1);
    assert.equal(sim.ddaTier, wavesForLevel(1) + 1);
});

test('gold, occupancy and spot checks refuse bad commands with a reason', () => {
    const sim = new Simulation(1, MAP_SOURCE); // 100 gold
    drain(sim);

    assert.equal(sim.build(0, 'dart'), true); // 60 left
    assert.equal(sim.build(0, 'dart'), false); // occupied
    assert.equal(sim.build(1, 'cannon'), false); // 60 < 70
    assert.equal(sim.build(99, 'dart'), false); // no such spot

    const reasons = drain(sim)
        .filter((event): event is RoundEvent & { type: 'blocked' } => event.type === 'blocked')
        .map((event) => event.reason);
    assert.deepEqual(reasons, ['occupied', 'gold', 'noSpot']);
    assert.equal(sim.gold, 60, 'a refused build costs nothing');
});

test('upgrades are absolute from the base stats, and level 3 is the cap', () => {
    const sim = new Simulation(5, MAP_SOURCE); // 180 gold
    drain(sim);

    assert.equal(sim.build(0, 'dart'), true); // 140 left
    const towerId = sim.towers[0].id;

    assert.equal(sim.upgrade(towerId), true); // level 2: 140 - 32 = 108
    assert.equal(sim.towers[0].level, 2);
    assert.equal(sim.towers[0].spent, 72);
    assert.ok(Math.abs(sim.towers[0].range - 2.4) < 1e-9, `range was ${sim.towers[0].range}`);

    assert.equal(sim.upgrade(towerId), true); // level 3: 108 - 48 = 60
    assert.ok(Math.abs(sim.towers[0].damage - 11.4) < 1e-9, `damage was ${sim.towers[0].damage}`);
    assert.ok(Math.abs(sim.towers[0].range - 2.6) < 1e-9, `range was ${sim.towers[0].range}`);
    assert.equal(sim.towers[0].spent, 120);

    assert.equal(sim.upgrade(towerId), false); // max level
    assert.equal(sim.gold, 60, 'a refused upgrade costs nothing');
    const reasons = drain(sim)
        .filter((event): event is RoundEvent & { type: 'blocked' } => event.type === 'blocked')
        .map((event) => event.reason);
    assert.deepEqual(reasons, ['maxLevel']);

    assert.equal(sim.sell(towerId), true);
    assert.equal(sim.towers.length, 0);
    assert.equal(sim.gold, 60 + Math.floor(120 * 0.7), 'selling returns 70% of the 120 spent');

    assert.equal(sim.upgrade(towerId), false); // it is gone
    assert.equal(sim.sell(towerId), false);
});

test('towers shoot the First enemy — the one furthest along the road', () => {
    const sim = new Simulation(1, MAP_SOURCE);
    // Spot 0 sits 1–2 tiles off the road, where the opening grunts walk past in file.
    assert.equal(sim.build(0, 'dart'), true);

    let firstBlood: { readonly woundedId: number; readonly leaderId: number } | null = null;

    for (let i = 0; i < 30 * 120 && !firstBlood; i++) {
        sim.step();
        const enemies = sim.snapshot().enemies;
        if (enemies.length < 2) continue;

        const wounded = enemies.filter((enemy) => enemy.hp < enemy.maxHp);
        if (wounded.length === 0) continue;

        // A dart has no splash: at first blood exactly one enemy is hurt — and it must
        // be the leader, because "First" targeting never fires at the trailing one.
        assert.equal(wounded.length, 1);
        const leader = enemies.reduce((a, b) => (a.progress > b.progress ? a : b));
        firstBlood = { woundedId: wounded[0].id, leaderId: leader.id };
    }

    assert.ok(firstBlood, 'the opening grunts never both came into range');
    assert.equal(firstBlood.woundedId, firstBlood.leaderId, 'the trailing grunt was shot first');
});

test('two simulations of the same level play out identically', () => {
    const play = (): { score: number; gold: number; lives: number; steps: number } => {
        const sim = new Simulation(3, MAP_SOURCE);
        const bot = createScriptedBot(sim.map.spots.length);
        let steps = 0;
        for (; steps < 30 * 600 && sim.phase === 'playing'; steps++) {
            if (steps % 15 === 0) for (const command of bot.decide(sim.snapshot())) sim.handle(command);
            sim.step();
        }
        return { score: sim.score, gold: sim.gold, lives: sim.lives, steps };
    };

    assert.deepEqual(play(), play());
});
