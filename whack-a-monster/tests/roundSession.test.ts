import assert from 'node:assert/strict';
import test from 'node:test';

import { RoundSession } from '../src/app/roundSession.ts';
import { HOLE_RADIUS, RISE_DISTANCE_RATIO, holePosition } from '../src/core/config.ts';
import type { AudioPort, BridgePort } from '../src/core/ports.ts';
import type { FieldPoint } from '../src/core/config.ts';

class FakeBridge implements BridgePort {
    readonly calls: string[] = [];

    launch(): void {
        this.calls.push('launch');
    }

    startRound(): void {
        this.calls.push('startRound');
    }

    endRound(win: boolean, score: number): void {
        this.calls.push(`endRound:${win}:${score}`);
    }

    exit(win: boolean, score: number): void {
        this.calls.push(`exit:${win}:${score}`);
    }
}

class FakeAudio implements AudioPort {
    readonly calls: string[] = [];

    resume(): void {
        this.calls.push('resume');
    }

    uiTap(): void {
        this.calls.push('uiTap');
    }

    whack(): void {
        this.calls.push('whack');
    }

    armorCrack(): void {
        this.calls.push('armorCrack');
    }

    heavySmash(): void {
        this.calls.push('heavySmash');
    }

    slash(): void {
        this.calls.push('slash');
    }

    deflect(): void {
        this.calls.push('deflect');
    }

    escape(): void {
        this.calls.push('escape');
    }

    roundOver(): void {
        this.calls.push('roundOver');
    }
}

const fixedRoll = (value: number): (() => number) => () => value;

const build = (roll = 0.1): { session: RoundSession; bridge: FakeBridge; audio: FakeAudio } => {
    const bridge = new FakeBridge();
    const audio = new FakeAudio();
    const session = new RoundSession({ bridge, audio, random: fixedRoll(roll) });
    session.startRound();
    return { session, bridge, audio };
};

/** Ticks the round until `predicate` holds; throws when the budget runs out. */
const until = (session: RoundSession, predicate: () => boolean, budgetMs = 60_000): void => {
    let elapsed = 0;
    while (!predicate()) {
        session.update(0.016);
        elapsed += 16;
        assert.ok(elapsed <= budgetMs, 'the round never reached the expected state');
    }
};

/** Field point at the centre of the first risen monster, or null. */
const targetOf = (session: RoundSession): FieldPoint | null => {
    for (const monster of session.world.monsters) {
        if (monster.state === 'active') return centre(monster.hole, monster.rise);
    }
    return null;
};

const centre = (hole: number, rise: number): FieldPoint => {
    const position = holePosition(hole);
    return { x: position.x, y: position.y - rise * HOLE_RADIUS * RISE_DISTANCE_RATIO };
};

const count = (calls: string[], prefix: string): number =>
    calls.filter((call) => call.startsWith(prefix)).length;

test('a round tells the host it started, exactly once per start', () => {
    const { bridge } = build();

    assert.deepEqual(bridge.calls, ['startRound']);
});

test('the first touch of a round unlocks audio', () => {
    const { session, audio } = build();

    assert.equal(audio.calls.includes('resume'), false, 'not before the player touches');
    session.tapAt({ x: 0, y: 0 });
    assert.equal(audio.calls.includes('resume'), true);
});

test('nothing is reported while the round is still running', () => {
    const { session, bridge } = build();

    session.update(0.016);
    assert.equal(session.finishRound(), null);
    assert.equal(count(bridge.calls, 'endRound'), 0);
});

test('the finalised round is reported once, with win true for a score chase', () => {
    const { session, bridge, audio } = build();

    until(session, () => session.roundOver);

    const result = session.finishRound();
    assert.ok(result, 'the panel gets a scorecard');
    assert.equal(result.win, true, 'an endless game reports win: true (AGENTS.md §4.2)');
    assert.equal(count(bridge.calls, 'endRound'), 1);
    assert.equal(bridge.calls[bridge.calls.length - 1], `endRound:true:${result.score}`);
    assert.equal(audio.calls.includes('roundOver'), true);

    assert.equal(session.finishRound(), null, 'a second call reports nothing');
    assert.equal(count(bridge.calls, 'endRound'), 1);
});

test('an escape costs a life and plays the escape cue', () => {
    const { session, audio } = build();

    until(session, () => session.world.lives < 3);

    assert.equal(audio.calls.includes('escape'), true);
    assert.equal(session.roundOver, false, 'one escape is not the end');
});

test('a normal monster falls to one tap with a single whack cue', () => {
    const { session, audio } = build(0.1);

    until(session, () => targetOf(session) !== null);
    session.tapAt(targetOf(session) as FieldPoint);

    assert.equal(count(audio.calls, 'whack'), 1);
    assert.equal(count(audio.calls, 'armorCrack'), 0);
});

test('an armored monster cracks before it smashes', () => {
    const { session, audio } = build(0.6);

    until(session, () => targetOf(session) !== null);
    const target = targetOf(session) as FieldPoint;

    session.tapAt(target);
    assert.equal(count(audio.calls, 'armorCrack'), 1, 'the helmet absorbs the first tap');
    assert.equal(count(audio.calls, 'heavySmash'), 0);

    session.tapAt(target);
    assert.equal(count(audio.calls, 'heavySmash'), 1);
});

test('a ninja deflects taps and only falls to a swipe', () => {
    const { session, audio } = build(0.9);

    until(session, () => targetOf(session) !== null);
    const target = targetOf(session) as FieldPoint;

    session.tapAt(target);
    assert.equal(count(audio.calls, 'deflect'), 1, 'taps are useless against a ninja');

    session.swipeAt(target, target);
    assert.equal(count(audio.calls, 'slash'), 1);
    assert.equal(session.world.score > 0, true, 'the swipe did score');
});

test('reportsWin can be overridden by whoever composes the session', () => {
    const bridge = new FakeBridge();
    const session = new RoundSession({
        bridge,
        audio: new FakeAudio(),
        random: fixedRoll(0.1),
        reportsWin: false,
    });
    session.startRound();
    until(session, () => session.roundOver);

    assert.equal(session.finishRound()?.win, false);
    assert.equal(bridge.calls[bridge.calls.length - 1], 'endRound:false:0');
});
