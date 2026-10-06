import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DragMoveInput } from '../src/adapters/input/DragMoveInput.ts';
import { CombinedInput } from '../src/adapters/input/CombinedInput.ts';
import { KeyboardMoveInput } from '../src/adapters/input/KeyboardMoveInput.ts';
import { ViewportAdapter } from '../src/adapters/input/ViewportAdapter.ts';
import { BridgeReporter } from '../src/adapters/bridge/BridgeReporter.ts';
import type { KeyState } from '../src/ports/KeyboardPort.ts';
import type { ViewportPort } from '../src/ports/ViewportPort.ts';
import type { ReportPort } from '../src/ports/ReportPort.ts';
import type {
  BulletFiredEvent,
  BulletPickedUpEvent,
  EnemyKilledEvent,
  LevelUpEvent,
  PlayerHitEvent,
  RunEndedEvent,
  UpgradeChosenEvent,
} from '../src/core/types.ts';

/** Mirrors of the adapter's own tuning, so the test states the contract. */
const STICK_RADIUS = 76;
const DEAD_ZONE = 12;
const FULL_AT = 48;

/**
 * A viewport that does something a real camera never would - swap the axes -
 * so the test can prove the drag adapter really asks the port for the world
 * delta instead of quietly using the screen one (AGENTS.md A4.3).
 */
class SwappingViewport implements ViewportPort {
  screenDeltaToWorld(dx: number, dy: number): { x: number; y: number } {
    return { x: dy, y: dx };
  }

  updateCamera(): void { /* not needed here */ }
}

/** Captures the host signals; the stand-in for `window.MpPostMessage`. */
class HostRecorder implements ReportPort {
  readonly calls: string[] = [];
  readonly endRounds: { win: boolean; score: number }[] = [];

  launch(): void { this.calls.push('launch'); }
  startRound(): void { this.calls.push('startRound'); }
  endRound(payload: { win: boolean; score: number }): void {
    this.calls.push('endRound');
    this.endRounds.push(payload);
  }
  exit(payload: { lastWin: boolean; lastScore: number }): void {
    this.calls.push(`exit:${payload.lastWin}:${payload.lastScore}`);
  }
}

const ORIGIN = { x: 300, y: 700 };

const dragTo = (input: DragMoveInput, x: number, y: number): void => {
  input.move(1, x, y);
};

/** A key state with everything up unless the test says otherwise. */
const keys = (held: Partial<KeyState> = {}): KeyState => ({
  up: false,
  down: false,
  left: false,
  right: false,
  ...held,
});

// ---------------------------------------------------------------------------

describe('ViewportAdapter', () => {
  test('divides a screen delta by the camera zoom', () => {
    const viewport = new ViewportAdapter();

    viewport.updateCamera(0, 0, 1);
    assert.deepEqual(viewport.screenDeltaToWorld(36, -72), { x: 36, y: -72 });

    viewport.updateCamera(120, 40, 2);
    assert.deepEqual(viewport.screenDeltaToWorld(36, -72), { x: 18, y: -36 });
  });

  test('scroll cancels out of a delta, so a drag means the same everywhere', () => {
    const viewport = new ViewportAdapter();

    viewport.updateCamera(0, 0, 1.5);
    const here = { ...viewport.screenDeltaToWorld(30, 10) };
    viewport.updateCamera(900, 4000, 1.5);
    const there = { ...viewport.screenDeltaToWorld(30, 10) };

    assert.deepEqual(here, there, 'where the camera is must not change the drag');
  });

  test('a broken zoom reading falls back to 1 rather than dividing by zero', () => {
    const viewport = new ViewportAdapter();

    viewport.updateCamera(0, 0, 0);
    assert.deepEqual(viewport.screenDeltaToWorld(10, 10), { x: 10, y: 10 });
    viewport.updateCamera(0, 0, Number.NaN);
    assert.deepEqual(viewport.screenDeltaToWorld(10, 10), { x: 10, y: 10 });
  });
});

describe('DragMoveInput', () => {
  test('the stick appears under the thumb and reads still until it moves', () => {
    const input = new DragMoveInput(new ViewportAdapter());

    assert.equal(input.getStick().active, false);
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });

    input.down(1, ORIGIN.x, ORIGIN.y);
    const stick = input.getStick();
    assert.equal(stick.active, true, 'down is what arms the stick');
    assert.equal(stick.originX, ORIGIN.x);
    assert.equal(stick.originY, ORIGIN.y);
    assert.deepEqual(input.getMove(), { x: 0, y: 0 }, 'a resting thumb does not walk');
  });

  test('drag distance maps to magnitude, with a dead zone at the start', () => {
    const input = new DragMoveInput(new ViewportAdapter());
    input.down(1, ORIGIN.x, ORIGIN.y);

    // Inside the dead zone: still.
    dragTo(input, ORIGIN.x + DEAD_ZONE - 1, ORIGIN.y);
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });

    // Halfway between the dead zone and full travel: half speed.
    dragTo(input, ORIGIN.x + (DEAD_ZONE + FULL_AT) / 2, ORIGIN.y);
    const halfway = input.getMove();
    assert.ok(Math.abs(halfway.x - 0.5) < 1e-9, `expected 0.5, got ${halfway.x}`);
    assert.equal(halfway.y, 0);

    // Past full travel: clamped to a full step, and the knob stops at the ring.
    dragTo(input, ORIGIN.x + 400, ORIGIN.y);
    const full = input.getMove();
    assert.equal(full.x, 1);
    const stick = input.getStick();
    assert.ok(
      Math.abs(stick.knobX - (ORIGIN.x + STICK_RADIUS)) < 1e-9,
      'the knob is clamped to the ring',
    );
    assert.equal(stick.knobY, ORIGIN.y);
  });

  test('the intent is a world vector, converted through the viewport port', () => {
    const input = new DragMoveInput(new SwappingViewport());
    input.down(1, ORIGIN.x, ORIGIN.y);

    // Screen drag is horizontal; the port reports it as a vertical world delta.
    dragTo(input, ORIGIN.x + FULL_AT, ORIGIN.y);
    const move = input.getMove();
    assert.ok(Math.abs(move.y - 1) < 1e-9, `expected the world y axis, got ${move.y}`);
    assert.equal(move.x, 0, 'the screen delta is never handed to the game directly');
  });

  test('the move vector is one stable object, rewritten in place', () => {
    const input = new DragMoveInput(new ViewportAdapter());
    input.down(1, ORIGIN.x, ORIGIN.y);

    const first = input.getMove();
    dragTo(input, ORIGIN.x + FULL_AT, ORIGIN.y);
    const second = input.getMove();
    assert.equal(first, second, 'the driver may hold the vector across a frame');

    input.releaseAll();
    assert.equal(input.getMove(), first, 'and releasing does not replace it');
    assert.deepEqual(first, { x: 0, y: 0 });
    assert.equal(input.getStick().active, false);
  });

  test('one thumb only, and a stray finger cannot steal the stick', () => {
    const input = new DragMoveInput(new ViewportAdapter());

    input.down(7, ORIGIN.x, ORIGIN.y);
    input.down(8, 0, 0); // second finger ignored
    assert.equal(input.getStick().originX, ORIGIN.x);

    input.move(8, 500, 500); // not our pointer
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });

    input.move(7, ORIGIN.x, ORIGIN.y - FULL_AT); // straight up
    assert.equal(input.getMove().y, -1);

    input.up(8); // not our pointer: still steering
    assert.equal(input.getStick().active, true);

    input.up(7);
    assert.equal(input.getStick().active, false);
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });
  });
});

describe('KeyboardMoveInput', () => {
  test('a held direction is one full step, and a quiet keyboard is still', () => {
    const input = new KeyboardMoveInput(new ViewportAdapter());

    assert.deepEqual(input.getMove(), { x: 0, y: 0 }, 'no key, no walk');

    input.setHeld(keys({ right: true }));
    assert.deepEqual(input.getMove(), { x: 1, y: 0 });

    input.setHeld(keys({ up: true }));
    assert.deepEqual(input.getMove(), { x: 0, y: -1 });

    input.setHeld(keys());
    assert.deepEqual(input.getMove(), { x: 0, y: 0 }, 'let go and it stops');
  });

  test('opposite keys cancel, and a diagonal is normalised to one step', () => {
    const input = new KeyboardMoveInput(new ViewportAdapter());

    input.setHeld(keys({ left: true, right: true }));
    assert.deepEqual(input.getMove(), { x: 0, y: 0 }, 'no key combination walks sideways');

    input.setHeld(keys({ right: true, down: true }));
    const diagonal = input.getMove();
    const length = Math.sqrt(diagonal.x * diagonal.x + diagonal.y * diagonal.y);
    assert.ok(Math.abs(length - 1) < 1e-9, `diagonal must be one full step, got ${length}`);
  });

  test('key directions become world directions through the viewport port', () => {
    // The port swaps the axes, so a screen-right key can only read as world
    // down if the adapter really asked it (AGENTS.md section 4.3).
    const input = new KeyboardMoveInput(new SwappingViewport());

    input.setHeld(keys({ right: true }));
    const move = input.getMove();
    assert.equal(move.y, 1, 'expected the world y axis');
    assert.equal(move.x, 0, 'the screen direction is never handed to the game directly');
  });

  test('the keyboard draws no stick of its own', () => {
    const input = new KeyboardMoveInput(new ViewportAdapter());

    input.setHeld(keys({ up: true }));
    assert.equal(input.getStick().active, false, 'only a finger puts the stick on screen');

    const first = input.getMove();
    input.setHeld(keys({ down: true }));
    assert.equal(input.getMove(), first, 'the move vector is one stable object, rewritten in place');
  });
});

describe('CombinedInput', () => {
  const build = (): { drag: DragMoveInput; input: CombinedInput } => {
    const drag = new DragMoveInput(new ViewportAdapter());
    const keyInput = new KeyboardMoveInput(new ViewportAdapter());
    return { drag, input: new CombinedInput(drag, keyInput) };
  };

  test('a held key wins, and the drag takes over again the moment the keys go quiet', () => {
    const { drag, input } = build();

    drag.down(1, ORIGIN.x, ORIGIN.y);
    dragTo(drag, ORIGIN.x + FULL_AT, ORIGIN.y);
    assert.equal(input.getMove().x, 1, 'no keys: the finger steers');

    input.setHeld(keys({ up: true }));
    assert.deepEqual(input.getMove(), { x: 0, y: -1 }, 'the two are never averaged together');

    input.setHeld(keys());
    assert.equal(input.getMove().x, 1, 'the finger never stopped dragging');

    drag.up(1);
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });
  });

  test('the stick stays the drag\'s stick, and pointers still reach the drag', () => {
    const { input } = build();

    assert.equal(input.getStick().active, false);

    input.down(7, ORIGIN.x, ORIGIN.y);
    input.move(7, ORIGIN.x, ORIGIN.y + STICK_RADIUS);
    assert.equal(input.getStick().active, true, 'pointer events are forwarded, not swallowed');
    assert.equal(input.getStick().originX, ORIGIN.x);

    input.setHeld(keys({ left: true }));
    assert.equal(input.getStick().active, true, 'holding a key does not move or hide the stick');

    input.releaseAll();
    assert.equal(input.getStick().active, false, 'a pointer releaseAll drops the stick');
    assert.deepEqual(input.getMove(), { x: -1, y: 0 }, 'key state is polled, so it survives that');
  });

  test('the move vector it hands out belongs to whichever adapter produced it', () => {
    const { drag, input } = build();

    drag.down(1, ORIGIN.x, ORIGIN.y);
    dragTo(drag, ORIGIN.x + FULL_AT, ORIGIN.y);
    assert.equal(input.getMove(), drag.getMove(), 'quiet keys: the drag\'s own vector');

    input.setHeld(keys({ right: true }));
    assert.notEqual(input.getMove(), drag.getMove(), 'held key: the keyboard\'s own vector');
    assert.deepEqual(input.getMove(), { x: 1, y: 0 });
  });
});

describe('BridgeReporter', () => {
  test('reports the finished round and nothing else', () => {
    const host = new HostRecorder();
    const reporter = new BridgeReporter(host);

    const runEnded: RunEndedEvent = {
      win: true,
      score: 1234,
      kills: 40,
      level: 5,
      wave: 7,
      time: 180,
    };
    const levelUp: LevelUpEvent = { level: 2, offers: ['sprint'] };
    const killed: EnemyKilledEvent = { kind: 'zombie', x: 1, y: 2, value: 1 };
    const hit: PlayerHitEvent = { hp: 3, maxHp: 5 };
    const fired: BulletFiredEvent = { x: 0, y: 0, angle: 1, held: 0 };
    const pickedUp: BulletPickedUpEvent = { x: 0, y: 0, held: 1 };
    const chosen: UpgradeChosenEvent = { id: 'sprint', level: 2 };

    reporter.onLevelUp(levelUp);
    reporter.onEnemyKilled(killed);
    reporter.onPlayerHit(hit);
    reporter.onBulletFired(fired);
    reporter.onBulletPickedUp(pickedUp);
    reporter.onUpgradeChosen(chosen);
    reporter.onRunEnded(runEnded);

    assert.deepEqual(host.calls, ['endRound'], 'the round end is the only signal it forwards');
    assert.deepEqual(host.endRounds, [{ win: true, score: 1234 }]);
  });

  test('forwards the payload verbatim, win flag included', () => {
    // The world only ever sends `win: true`, but the adapter is a relay: it
    // must pass on whatever it is given rather than interpret it.
    const host = new HostRecorder();
    const reporter = new BridgeReporter(host);

    reporter.onRunEnded({ win: false, score: 210, kills: 9, level: 2, wave: 3, time: 47.4 });

    assert.deepEqual(host.endRounds, [{ win: false, score: 210 }]);
  });
});
