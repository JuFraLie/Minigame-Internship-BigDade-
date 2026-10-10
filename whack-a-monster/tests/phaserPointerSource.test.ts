import assert from 'node:assert/strict';
import test from 'node:test';

import type Phaser from 'phaser';
import type { FieldPoint } from '../src/core/config.ts';
import type { FxPort } from '../src/core/ports.ts';
import { attachPointerInput } from '../src/input/pointerInput.ts';
import { phaserPointerSource } from '../src/input/phaserPointerSource.ts';
import { computeLayout, fieldToScreen } from '../src/rendering/layout.ts';

/**
 * The adapter is the only place that knows which Phaser events carry a press, a motion and
 * a release. Phaser reports each of them exactly once, choosing between an "on the canvas"
 * event and an "outside the canvas" event, so subscribing to one half of each pair silently
 * drops every gesture that starts or ends off the canvas — the drag opens and never closes,
 * and the round sees nothing at all. These tests pin both halves.
 */

type Listener = (pointer: { x: number; y: number }) => void;

/** Stand-in for a scene's input plugin: records who subscribed, and can fire for them. */
class FakeInputPlugin {
    private readonly listeners = new Map<string, Set<Listener>>();

    on(event: string, listener: Listener): void {
        const set = this.listeners.get(event) ?? new Set<Listener>();
        set.add(listener);
        this.listeners.set(event, set);
    }

    off(event: string, listener: Listener): void {
        this.listeners.get(event)?.delete(listener);
    }

    /** How many handlers are currently listening to `event`. */
    count(event: string): number {
        return this.listeners.get(event)?.size ?? 0;
    }

    emit(event: string, pointer: { x: number; y: number }): void {
        for (const listener of [...(this.listeners.get(event) ?? [])]) listener(pointer);
    }
}

const makeScene = (): { scene: Phaser.Scene; input: FakeInputPlugin } => {
    const input = new FakeInputPlugin();
    const scene = {
        cameras: { main: { getWorldPoint: (x: number, y: number) => ({ x, y }) } },
        input,
    };
    return { scene: scene as unknown as Phaser.Scene, input };
};

const viewport = { width: 420, height: 900, safeTop: 0 };
const layout = computeLayout(viewport);

class RecordingRound {
    readonly taps: FieldPoint[] = [];
    readonly swipes: { from: FieldPoint; to: FieldPoint }[] = [];

    tapAt(point: FieldPoint): void {
        this.taps.push(point);
    }

    swipeAt(from: FieldPoint, to: FieldPoint): void {
        this.swipes.push({ from, to });
    }
}

const noopFx: FxPort = {
    scorePop: () => undefined,
    tapMark: () => undefined,
    swipeTrail: () => undefined,
    armorBump: () => undefined,
};

test('a press is reported whether or not it starts on the canvas', () => {
    const { scene, input } = makeScene();
    const source = phaserPointerSource(scene);
    const seen: { x: number; y: number }[] = [];

    const dispose = source.onDown((x, y) => seen.push({ x, y }));

    input.emit('pointerdown', { x: 10, y: 20 });
    input.emit('pointerdownoutside', { x: 30, y: 40 });

    assert.deepEqual(seen, [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
    ]);
    dispose();
});

test('a release is reported whether or not it ends on the canvas', () => {
    const { scene, input } = makeScene();
    const source = phaserPointerSource(scene);
    const seen: { x: number; y: number }[] = [];

    const dispose = source.onUp((x, y) => seen.push({ x, y }));

    input.emit('pointerup', { x: 10, y: 20 });
    input.emit('pointerupoutside', { x: 30, y: 40 });

    assert.deepEqual(seen, [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
    ]);
    dispose();
});

test('a release outside the canvas still completes the gesture as a swipe', () => {
    // The reported phone/desktop symptom: the finger swipes across a monster and lifts just
    // past the canvas edge, so Phaser sends `pointerupoutside`. With only `pointerup`
    // subscribed the drag is never released — no cut, no trail, no ring, no dodge: the
    // gesture leaves no trace at all. The move below stays short of a slash on purpose, so
    // only the release can complete this one.
    const { scene, input } = makeScene();
    const round = new RecordingRound();

    const adapter = attachPointerInput({
        source: phaserPointerSource(scene),
        round,
        layout,
        fx: noopFx,
    });

    const start = fieldToScreen(layout, { x: 90, y: 420 });
    const end = fieldToScreen(layout, { x: 260, y: 430 });

    input.emit('pointerdown', start);
    input.emit('pointermove', { x: start.x + 5, y: start.y });
    input.emit('pointerupoutside', end);

    assert.equal(round.swipes.length, 1, 'the gesture that ended off the canvas still slashes');
    assert.equal(round.taps.length, 0);
    assert.ok(Math.abs(round.swipes[0].from.x - 90) < 1e-9);
    assert.ok(Math.abs(round.swipes[0].to.x - 260) < 1e-9);

    adapter.dispose();
});

test('disposing detaches every variant of each gesture', () => {
    const { scene, input } = makeScene();
    const source = phaserPointerSource(scene);

    const disposeDown = source.onDown(() => undefined);
    const disposeMove = source.onMove(() => undefined);
    const disposeUp = source.onUp(() => undefined);

    assert.equal(input.count('pointerdown'), 1);
    assert.equal(input.count('pointerdownoutside'), 1);
    assert.equal(input.count('pointermove'), 1);
    assert.equal(input.count('pointerup'), 1);
    assert.equal(input.count('pointerupoutside'), 1);

    disposeDown();
    disposeMove();
    disposeUp();

    assert.equal(input.count('pointerdown'), 0, 'no press listener leaks after teardown');
    assert.equal(input.count('pointerdownoutside'), 0);
    assert.equal(input.count('pointermove'), 0);
    assert.equal(input.count('pointerup'), 0, 'no release listener leaks after teardown');
    assert.equal(input.count('pointerupoutside'), 0);
});
