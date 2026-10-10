import assert from 'node:assert/strict';
import test from 'node:test';

import type { FieldPoint } from '../src/core/config.ts';
import { attachPointerInput } from '../src/input/pointerInput.ts';
import type { PointerHandler, PointerSource, RoundInputPort } from '../src/input/pointerInput.ts';
import type { FxPort } from '../src/core/ports.ts';
import { computeLayout, fieldToScreen } from '../src/rendering/layout.ts';

/** Screen events the tests inject, exactly as a scene would deliver them. */
class FakeSource implements PointerSource {
    private down: PointerHandler | null = null;
    private move: PointerHandler | null = null;
    private up: PointerHandler | null = null;

    onDown(handler: PointerHandler): () => void {
        this.down = handler;
        return () => {
            this.down = null;
        };
    }

    onMove(handler: PointerHandler): () => void {
        this.move = handler;
        return () => {
            this.move = null;
        };
    }

    onUp(handler: PointerHandler): () => void {
        this.up = handler;
        return () => {
            this.up = null;
        };
    }

    press(x: number, y: number, id = 0): void {
        this.down?.(x, y, id);
    }

    drag(x: number, y: number, id = 0): void {
        this.move?.(x, y, id);
    }

    release(x: number, y: number, id = 0): void {
        this.up?.(x, y, id);
    }
}

class FakeRound implements RoundInputPort {
    readonly taps: FieldPoint[] = [];
    readonly swipes: { from: FieldPoint; to: FieldPoint }[] = [];

    tapAt(point: FieldPoint): void {
        this.taps.push(point);
    }

    swipeAt(from: FieldPoint, to: FieldPoint): void {
        this.swipes.push({ from, to });
    }
}

class FakeFx implements FxPort {
    taps = 0;
    trails = 0;

    scorePop(): void {
        /* not exercised here */
    }

    tapMark(): void {
        this.taps += 1;
    }

    swipeTrail(): void {
        this.trails += 1;
    }

    armorBump(): void {
        /* not exercised here */
    }
}

const viewport = { width: 420, height: 900, safeTop: 0 };
const layout = computeLayout(viewport);

const near = (actual: FieldPoint, expected: FieldPoint): void => {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `x ${actual.x} vs ${expected.x}`);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `y ${actual.y} vs ${expected.y}`);
};

const setup = (): {
    source: FakeSource;
    round: FakeRound;
    fx: FakeFx;
    dispose: () => void;
} => {
    const source = new FakeSource();
    const round = new FakeRound();
    const fx = new FakeFx();

    const input = attachPointerInput({
        source,
        round,
        layout,
        fx,
    });

    return { source, round, fx, dispose: () => input.dispose() };
};

test('a press is converted from screen space into field space', () => {
    const { source, round, fx } = setup();
    const fieldPoint: FieldPoint = { x: 120, y: 340 };
    const screenPoint = fieldToScreen(layout, fieldPoint);

    source.press(screenPoint.x, screenPoint.y);
    source.release(screenPoint.x, screenPoint.y);

    assert.equal(round.taps.length, 1, 'exactly one tap reaches the round');
    near(round.taps[0], fieldPoint);
    assert.equal(round.swipes.length, 0);
    assert.equal(fx.taps, 1, 'the tap leaves a mark');
});

test('a quick drag is a swipe reported as the path the finger took', () => {
    const { source, round, fx } = setup();
    const start = fieldToScreen(layout, { x: 90, y: 420 });
    const end = fieldToScreen(layout, { x: 260, y: 430 });

    source.press(start.x, start.y);
    source.drag(end.x, end.y);
    source.release(end.x, end.y);

    assert.equal(round.swipes.length, 1, 'a swipe, not a tap');
    assert.equal(round.taps.length, 0);
    near(round.swipes[0].from, { x: 90, y: 420 });
    near(round.swipes[0].to, { x: 260, y: 430 });
    assert.equal(fx.trails, 1, 'the swipe leaves a trail');
    assert.equal(fx.taps, 0);
});

test('the slash lands while the finger is still moving, without any release', () => {
    // The reported phone symptom: swiping across a wolf did nothing at all. A touch
    // gesture can end without its release ever reaching the scene, so a cut that is only
    // reported when the finger lifts is a cut that never happens. The path is reported
    // as soon as it is long enough to be a slash — no release, no clock.
    const { source, round, fx } = setup();
    const start = fieldToScreen(layout, { x: 90, y: 420 });
    const end = fieldToScreen(layout, { x: 260, y: 430 });

    source.press(start.x, start.y);
    source.drag(end.x, end.y);

    assert.equal(round.swipes.length, 1, 'the cut is reported by the move itself');
    assert.equal(round.taps.length, 0);
    near(round.swipes[0].from, { x: 90, y: 420 });
    near(round.swipes[0].to, { x: 260, y: 430 });

    // The finger keeps moving over a second target: every further sample still cuts, so
    // the gesture can reach a monster that only comes under it later.
    source.drag(fieldToScreen(layout, { x: 320, y: 300 }).x, fieldToScreen(layout, { x: 320, y: 300 }).y);
    assert.ok(round.swipes.length > 1, 'the cut follows the finger for the whole gesture');
    assert.equal(fx.trails, 0, 'no trail before the gesture ends');
});

test('a gesture whose move samples never arrived still slashes press to lift', () => {
    // The other way a swipe goes missing: the browser drops the motion (it decides the
    // finger is scrolling, or the touch leaves the canvas) and only press and lift are
    // delivered. The displacement between them is the path.
    const { source, round, fx } = setup();
    const start = fieldToScreen(layout, { x: 90, y: 420 });
    const end = fieldToScreen(layout, { x: 260, y: 430 });

    source.press(start.x, start.y);
    source.release(end.x, end.y);

    assert.equal(round.swipes.length, 1, 'press to lift is a slash on its own');
    assert.equal(round.taps.length, 0);
    near(round.swipes[0].from, { x: 90, y: 420 });
    near(round.swipes[0].to, { x: 260, y: 430 });
    assert.equal(fx.trails, 1, 'the swipe leaves a trail');
});

test('a press held for any length of time still slashes when it moves', () => {
    // The touchscreen gesture: the finger lands, the player aims at the wolf, then
    // drags. How long the contact lasts says nothing about whether it is a slash — the
    // path is what decides, so duration is no longer consulted at all.
    const { source, round, fx } = setup();
    const start = fieldToScreen(layout, { x: 90, y: 420 });
    const end = fieldToScreen(layout, { x: 260, y: 430 });

    source.press(start.x, start.y);
    source.drag(end.x, end.y);
    source.release(end.x, end.y);

    assert.equal(round.swipes.length, 1, 'the drag slashes, however deliberate it was');
    assert.equal(round.taps.length, 0);
    assert.equal(fx.trails, 1, 'the swipe leaves a trail');
});

test('a drag shorter than the swipe threshold is a tap', () => {
    const { source, round } = setup();
    const start = fieldToScreen(layout, { x: 150, y: 500 });
    const end = fieldToScreen(layout, { x: 170, y: 500 });

    source.press(start.x, start.y);
    source.drag(end.x, end.y);
    source.release(end.x, end.y);

    assert.equal(round.taps.length, 1);
    assert.equal(round.swipes.length, 0, '20 field units is a fumble, not a slash');
});

test('a fumbled press stays a tap even when the finger keeps drifting', () => {
    // 40 field units: well short of a slash, but enough that a miscounted distance
    // (path length plus the straight-line distance on top of it) would call it one.
    const { source, round } = setup();
    const start = fieldToScreen(layout, { x: 150, y: 500 });
    const end = fieldToScreen(layout, { x: 190, y: 500 });

    source.press(start.x, start.y);
    source.drag(end.x, end.y);
    source.release(end.x, end.y);

    assert.equal(round.taps.length, 1, 'the press is still a tap');
    assert.equal(round.swipes.length, 0, 'a drifting tap must not become a slash');
    near(round.taps[0], { x: 150, y: 500 });
});

test('a release without a press reaches nothing', () => {
    const { source, round } = setup();

    source.release(10, 10);

    assert.equal(round.taps.length, 0);
    assert.equal(round.swipes.length, 0);
});

test('dispose detaches the adapter from the source', () => {
    const { source, round, dispose } = setup();
    const screenPoint = fieldToScreen(layout, { x: 100, y: 100 });

    dispose();
    source.press(screenPoint.x, screenPoint.y);
    source.release(screenPoint.x, screenPoint.y);

    assert.equal(round.taps.length, 0, 'no input leaks after the scene tore down');
});

test('a second finger landing does not hijack the gesture already in progress', () => {
    // Two-thumb play is normal on a phone: the second thumb often lands while the first
    // is still down. Without a pointer identity the second press simply overwrites the
    // running gesture, so the first finger's release is measured from the *other* side of
    // the screen — a plain tap is then reported as a swipe, and no tap reaches the round
    // at all: the whack the player aimed is simply lost.
    const { source, round } = setup();
    const first = fieldToScreen(layout, { x: 90, y: 300 });
    const second = fieldToScreen(layout, { x: 360, y: 300 });

    source.press(first.x, first.y, 1);
    source.press(second.x, second.y, 2);
    source.release(first.x, first.y, 1);

    assert.equal(round.swipes.length, 0, 'the other finger must not turn a tap into a slash');
    assert.equal(round.taps.length, 1, 'the first press still taps');
    near(round.taps[0], { x: 90, y: 300 });

    source.release(second.x, second.y, 2);
    assert.equal(round.taps.length, 2, 'the second finger taps as well');
    near(round.taps[1], { x: 360, y: 300 });
    assert.equal(round.swipes.length, 0, 'and neither contact produced a phantom swipe');
});

test('a pointer that never pressed cannot lengthen the running gesture', () => {
    // The other half of the same defect: Phaser reports every pointer's motion, so a
    // second contact moving across the screen (a palm, a resting thumb) used to feed its
    // travel into the gesture that was actually in progress and promote it to a swipe.
    const { source, round } = setup();
    const start = fieldToScreen(layout, { x: 150, y: 500 });
    const elsewhere = fieldToScreen(layout, { x: 340, y: 260 });

    source.press(start.x, start.y, 1);
    source.drag(elsewhere.x, elsewhere.y, 2);
    source.release(start.x, start.y, 1);

    assert.equal(round.swipes.length, 0, 'the stationary press is still a tap');
    assert.equal(round.taps.length, 1);
    near(round.taps[0], { x: 150, y: 500 });
});
