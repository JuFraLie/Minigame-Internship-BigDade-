import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HOLE_RADIUS,
    MAX_LIVES,
    MONSTER_RULES,
    RISE_DISTANCE_RATIO,
    holePosition,
} from '../src/core/config.ts';
import type { Random } from '../src/core/ports.ts';
import { GameWorld } from '../src/core/world.ts';
import type { WorldEvent } from '../src/core/types.ts';

/**
 * Every roll returns the same value, which makes the whole round reproducible: `0.1` picks
 * a normal monster in the first free hole, so the tests can aim at an exact spot.
 */
const fixedRoll = (value: number): Random => () => value;

/** Field point at the centre of whatever is currently risen. */
const centreOf = (hole: number, rise: number): { x: number; y: number } => {
    const position = holePosition(hole);
    return { x: position.x, y: position.y - rise * HOLE_RADIUS * RISE_DISTANCE_RATIO };
};

/** Advances the simulation until `predicate` holds, or the budget runs out. */
const runUntil = (world: GameWorld, predicate: () => boolean, budgetMs = 30_000): void => {
    let elapsed = 0;
    while (!predicate()) {
        world.update(0.016);
        elapsed += 16;
        assert.ok(elapsed <= budgetMs, 'the simulation never reached the expected state');
    }
};

const activeIndex = (world: GameWorld): number =>
    world.monsters.findIndex((monster) => monster.state === 'active');

test('a fresh round starts empty, playable and without any history', () => {
    const world = new GameWorld(fixedRoll(0.1));

    assert.equal(world.phase, 'playing');
    assert.equal(world.score, 0);
    assert.equal(world.lives, MAX_LIVES);
    assert.ok(world.monsters.every((monster) => monster.state === 'hidden'));

    // The first spawn waits for `firstSpawnDelayMs` plus one interval.
    for (let i = 0; i < 40; i++) world.update(0.016);
    assert.ok(world.monsters.every((monster) => monster.state === 'hidden'), 'not yet');
});

test('a tap on a risen monster scores and emits a defeat event', () => {
    const world = new GameWorld(fixedRoll(0.1));
    const events: WorldEvent[] = [];
    world.subscribe((event) => events.push(event));

    runUntil(world, () => activeIndex(world) >= 0);
    const index = activeIndex(world);
    const monster = world.monsters[index];

    assert.equal(monster.kind, 'normal', 'the fixed roll always picks a normal monster');
    assert.equal(world.tap(centreOf(monster.hole, monster.rise)), true);

    assert.equal(world.score, MONSTER_RULES.normal.points);
    assert.equal(world.defeated, 1);
    assert.equal(world.combo, 1);
    assert.ok(events.some((event) => event.type === 'monsterDefeated'));

    // The slot keeps the whacked monster until it sinks, so it cannot be double-hit.
    assert.equal(world.tap(centreOf(monster.hole, monster.rise)), false);
});

test('a swipe slashes along the whole path, not only where the finger lifted', () => {
    const world = new GameWorld(fixedRoll(0.9));

    runUntil(world, () => activeIndex(world) >= 0);
    const monster = world.monsters[activeIndex(world)];
    assert.equal(monster.kind, 'ninja', 'the high roll always picks a ninja');

    const centre = centreOf(monster.hole, monster.rise);
    const past = { x: centre.x + HOLE_RADIUS * 3, y: centre.y };

    // Neither endpoint lands on the ninja: only the path crosses it.
    assert.equal(world.swipe({ x: centre.x - HOLE_RADIUS * 3, y: centre.y }, past), true);

    assert.equal(world.score, MONSTER_RULES.ninja.points, 'the slash connected');
    assert.equal(world.swipe(centre, past), false, 'a whacked slot cannot be hit twice');
});

test('a slash is not eaten by a tap-only monster standing in its way', () => {
    // One roll per spawn: hole first, then kind. So this scripts a normal monster into
    // hole 0 and a ninja into hole 1 — two monsters up at the same time, ninja second.
    const rolls = [0.05, 0.05, 0.05, 0.9];
    let next = 0;
    const world = new GameWorld(() => rolls[Math.min(next++, rolls.length - 1)]);

    // Both monsters are up at the same time: hole 0 spawns first, hole 1 one interval later,
    // just before the first one would retreat.
    runUntil(world, () => world.monsters[0].hittable && world.monsters[1].hittable);

    const blocker = world.monsters[0];
    const ninja = world.monsters[1];
    assert.equal(blocker.kind, 'normal', 'hole 0 holds the tap-only monster');
    assert.equal(ninja.kind, 'ninja', 'hole 1 holds the ninja');

    // The slash starts on the normal monster and finishes on the ninja.
    const slash = {
        from: centreOf(blocker.hole, blocker.rise),
        to: centreOf(ninja.hole, ninja.rise),
    };

    assert.equal(world.swipe(slash.from, slash.to), true, 'the slash connected');
    assert.equal(world.score, MONSTER_RULES.ninja.points, 'the ninja took the cut');
    assert.equal(ninja.state, 'whacked');

    // A slash only cuts ninjas: it passes straight through everything else.
    assert.equal(blocker.hitsTaken, 0, 'the tap-only monster was not damaged');
    assert.notEqual(blocker.state, 'whacked', 'and it was not whacked by the slash');
});

test('a tap that misses nothing changes the score', () => {
    const world = new GameWorld(fixedRoll(0.1));

    assert.equal(world.tap({ x: 0, y: 0 }), false);
    assert.equal(world.score, 0);
    assert.equal(world.defeated, 0);
});

test('three escapes end the round and emit roundOver exactly once', () => {
    const world = new GameWorld(fixedRoll(0.1));
    const events: WorldEvent[] = [];
    world.subscribe((event) => events.push(event));

    runUntil(world, () => world.phase === 'over');

    assert.equal(world.lives, 0);
    assert.equal(events.filter((event) => event.type === 'monsterEscaped').length, MAX_LIVES);
    assert.equal(events.filter((event) => event.type === 'roundOver').length, 1);

    const scoreAtEnd = world.score;
    world.update(1);
    world.tap({ x: 0, y: 0 });
    assert.equal(world.phase, 'over');
    assert.equal(world.score, scoreAtEnd, 'nothing moves after the round is over');
    assert.equal(events.filter((event) => event.type === 'roundOver').length, 1);
});

test('reset replays the round with no memory of the previous one', () => {
    const world = new GameWorld(fixedRoll(0.1));

    runUntil(world, () => world.phase === 'over');
    world.reset();

    assert.equal(world.phase, 'playing');
    assert.equal(world.score, 0);
    assert.equal(world.lives, MAX_LIVES);
    assert.equal(world.combo, 0);
    assert.equal(world.defeated, 0);
    assert.ok(world.monsters.every((monster) => monster.state === 'hidden'));
});

test('the simulation is deterministic for a given random sequence', () => {
    /** Ten seconds of a scripted player that whacks whatever is up. */
    const playOut = (): number => {
        const world = new GameWorld(fixedRoll(0.2));
        for (let frame = 0; frame < 600; frame++) {
            world.update(0.016);
            const index = activeIndex(world);
            if (index >= 0) {
                const monster = world.monsters[index];
                world.tap(centreOf(monster.hole, monster.rise));
            }
        }
        return world.score;
    };

    const first = playOut();
    assert.ok(first > 0, 'the scripted player actually scores');
    assert.equal(playOut(), first, 'the same random sequence replays identically');
});

test('every monster slot is reported every frame without allocating', () => {
    const world = new GameWorld(fixedRoll(0.1));
    const first = world.monsters;

    runUntil(world, () => activeIndex(world) >= 0);
    world.update(0.016);

    assert.equal(world.monsters, first, 'the same array instance is reused');
});

test('a tap between two neighbouring monsters lands on the one under the finger', () => {
    // Two rolls per spawn: the hole first, then the kind. So this scripts a normal
    // monster into hole 0 and a second one into hole 1.
    const rolls = [0.05, 0.05, 0.05, 0.05];
    let next = 0;
    const world = new GameWorld(() => rolls[Math.min(next++, rolls.length - 1)]);

    runUntil(world, () => world.monsters[0].state === 'active' && world.monsters[1].state === 'active');

    const left = world.monsters[0];
    const right = world.monsters[1];
    assert.equal(left.kind, 'normal', 'hole 0 holds a normal monster');
    assert.equal(right.kind, 'normal', 'hole 1 holds a normal monster');

    // The hit reach of two adjacent holes overlaps: the creature is 130 field units wide
    // on a 135-unit pitch, and the reach has to cover the whole creature. This point lies
    // inside both circles — 65 units short of the right centre, 70 units past the left
    // one — so the only thing that decides which monster takes the hit is which of them
    // is actually under the finger.
    const point = { x: holePosition(1).x - 65, y: centreOf(1, right.rise).y };

    assert.equal(world.tap(point), true);
    assert.equal(right.state, 'whacked', 'the monster under the finger takes the hit');
    assert.equal(left.state, 'active', 'the neighbour is left alone');
    assert.equal(world.score, MONSTER_RULES.normal.points, 'and exactly one monster scored');
});
