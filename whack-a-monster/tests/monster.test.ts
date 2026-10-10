import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HOLE_RADIUS,
    HIT_RADIUS_RATIO,
    MIN_STAY_MS,
    MONSTER_RULES,
    RISE_DISTANCE_RATIO,
    holePosition,
} from '../src/core/config.ts';
import { Monster } from '../src/core/monster.ts';

/** Field point at the centre of a risen monster — what the player actually taps. */
const centreOf = (monster: Monster): { x: number; y: number } => {
    const hole = holePosition(monster.hole);
    return { x: hole.x, y: hole.y - monster.rise * HOLE_RADIUS * RISE_DISTANCE_RATIO };
};

/** Ticks a freshly spawned monster up to `active`. */
const makeActive = (monster: Monster): void => {
    monster.spawn('normal', 1);
    for (let i = 0; i < 10 && monster.state !== 'active'; i++) monster.update(0.05);
    assert.equal(monster.state, 'active');
};

/** Runs the monster until it escapes, in 50 ms steps, and reports the time taken. */
const msUntilEscape = (monster: Monster): number => {
    let elapsed = 0;
    for (;;) {
        elapsed += 50;
        if (monster.update(0.05)) return elapsed;
        assert.ok(elapsed < 10_000, 'the monster must eventually escape');
    }
};

test('a monster emerges, then escapes once its stay runs out', () => {
    const monster = new Monster(0, 0);
    monster.spawn('normal', 1);

    assert.equal(monster.state, 'emerging');
    assert.equal(monster.rise, 0);

    monster.update(0.05);
    assert.equal(monster.state, 'emerging', 'half way up after 50 ms at rate 5/s');
    assert.ok(monster.rise > 0);

    while (monster.state === 'emerging') monster.update(0.05);
    assert.equal(monster.state, 'active');

    const survived = msUntilEscape(monster);
    assert.ok(
        Math.abs(survived - MONSTER_RULES.normal.stayMs) <= 50,
        `escaped after ~${MONSTER_RULES.normal.stayMs} ms, took ${survived} ms`,
    );
    assert.equal(monster.state, 'retreating');
});

test('higher difficulty shortens the stay but never below the floor', () => {
    const slow = new Monster(0, 0);
    makeActive(slow);
    const slowMs = msUntilEscape(slow);

    const fast = new Monster(1, 1);
    fast.spawn('normal', 3.5);
    for (let i = 0; i < 10 && fast.state !== 'active'; i++) fast.update(0.05);
    const fastMs = msUntilEscape(fast);

    assert.ok(fastMs < slowMs, 'a faster round gives less time per monster');
    assert.ok(
        Math.abs(fastMs - MIN_STAY_MS) <= 50,
        `floor respected: expected ~${MIN_STAY_MS} ms, took ${fastMs} ms`,
    );
});

test('a normal monster falls to a single tap', () => {
    const monster = new Monster(0, 0);
    makeActive(monster);

    assert.ok(monster.contains(centreOf(monster)));
    assert.equal(monster.tap(), 'defeated');
    assert.equal(monster.state, 'whacked');
    assert.equal(monster.hitsTaken, 1);
});

test('an armored monster needs two taps', () => {
    const monster = new Monster(0, 0);
    monster.spawn('armored', 1);
    for (let i = 0; i < 10 && monster.state !== 'active'; i++) monster.update(0.05);

    assert.equal(monster.tap(), 'cracked', 'the helmet absorbs the first hit');
    assert.equal(monster.state, 'active', 'it is still up after one tap');
    assert.equal(monster.tap(), 'defeated');
});

test('a ninja deflects taps and only falls to a swipe', () => {
    const monster = new Monster(0, 0);
    monster.spawn('ninja', 1);
    for (let i = 0; i < 10 && monster.state !== 'active'; i++) monster.update(0.05);

    assert.equal(monster.tap(), 'deflected');
    assert.ok(monster.dodge > 0, 'the deflection is visible as a shake');
    assert.equal(monster.swipe(), true);
    assert.equal(monster.state, 'whacked');
});

test('a swipe does not defeat a tap-only monster', () => {
    const monster = new Monster(0, 0);
    makeActive(monster);

    assert.equal(monster.swipe(), false);
    assert.equal(monster.state, 'active');
});

test('hidden monsters cannot be hit, whatever the player taps', () => {
    const monster = new Monster(0, 0);
    const hole = holePosition(0);

    assert.equal(monster.contains(hole), false);
    assert.equal(monster.tap(), 'none');
    assert.equal(monster.swipe(), false);
});

test('the hit box is a circle of HIT_RADIUS_RATIO around the risen centre', () => {
    const monster = new Monster(0, 0);
    makeActive(monster);

    const centre = centreOf(monster);
    const reach = HOLE_RADIUS * HIT_RADIUS_RATIO;

    // Probe a hair inside the rim: `centre.x + reach - centre.x` does not always come back
    // as exactly `reach` in floating point, and the boundary itself is not what is under
    // test — being that close to the edge is.
    assert.ok(
        monster.contains({ x: centre.x + reach - 1e-9, y: centre.y }),
        'edge counts as a hit',
    );
    assert.equal(
        monster.contains({ x: centre.x + reach + 1, y: centre.y }),
        false,
        'just outside misses',
    );
    assert.equal(
        monster.contains({ x: centre.x, y: centre.y - reach - 1 }),
        false,
        'the risen centre is what matters, not the hole',
    );
});

test('the reach covers the whole creature the player can see', () => {
    // The creature art is 130x140 and `WorldView` draws it at field scale, so a risen
    // monster reaches 65 field units sideways and 70 up and down from its centre. A reach
    // shorter than that leaves an outer ring of the drawn wolf hittable in no way: a
    // slash laid plainly across its head connects with nothing and the monster does not
    // react — which is what "swiping does nothing" looked like on the phone.
    const ART_HALF_WIDTH = 130 / 2;
    const ART_HALF_HEIGHT = 140 / 2;
    const reach = HOLE_RADIUS * HIT_RADIUS_RATIO;

    assert.ok(reach >= ART_HALF_WIDTH, 'the sides of the drawn creature count as a hit');
    assert.ok(reach >= ART_HALF_HEIGHT, 'its ears and jaw count as a hit too');
});

test('clear puts the monster back in its hole', () => {
    const monster = new Monster(0, 0);
    monster.spawn('armored', 1);
    for (let i = 0; i < 10 && monster.state !== 'active'; i++) monster.update(0.05);
    monster.tap();

    monster.clear();

    assert.equal(monster.state, 'hidden');
    assert.equal(monster.rise, 0);
    assert.equal(monster.hitsTaken, 0);
    assert.equal(monster.kind, 'normal');
    assert.equal(monster.contains(holePosition(0)), false);
});
