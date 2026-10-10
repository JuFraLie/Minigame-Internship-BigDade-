import assert from 'node:assert/strict';
import test from 'node:test';

import { HOLE_RADIUS, RISE_DISTANCE_RATIO, holePosition } from '../src/core/config.ts';
import type { Random } from '../src/core/ports.ts';
import { GameWorld } from '../src/core/world.ts';

/**
 * Headless performance budget for the simulation (AGENTS.md §3.3, §4.3).
 *
 * The renderer is deliberately absent: this measures the part of the game that has to stay
 * cheap on every device, so a regression shows up as a number instead of a feeling. The
 * budget is deliberately loose — the target device must keep 20 ms per *whole* frame, so
 * logic alone is given a tenth of that.
 */
const FRAMES = 3600; // one minute at 60 fps
const FRAME_SECONDS = 1 / 60;
const BUDGET_MS_PER_FRAME = 2;

/** mulberry32: a tiny deterministic RNG, so the run is repeatable. */
const seededRandom = (seed: number): Random => {
    let state = seed >>> 0;
    return (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const centreOf = (hole: number, rise: number): { x: number; y: number } => {
    const position = holePosition(hole);
    return { x: position.x, y: position.y - rise * HOLE_RADIUS * RISE_DISTANCE_RATIO };
};

test(`a minute of headless play costs under ${BUDGET_MS_PER_FRAME} ms per frame`, () => {
    const world = new GameWorld(seededRandom(20260929));
    let restarts = 0;

    const start = performance.now();

    for (let frame = 0; frame < FRAMES; frame++) {
        world.update(FRAME_SECONDS);

        // Scripted player: whack whatever is up, slash the ninjas.
        for (const monster of world.monsters) {
            if (monster.state !== 'active') continue;
            const target = centreOf(monster.hole, monster.rise);
            if (monster.kind === 'ninja') world.swipe(target, target);
            else world.tap(target);
        }

        // Keep the round alive so escapes, spawns and resets are all exercised.
        if (world.phase === 'over') {
            world.reset();
            restarts += 1;
        }
    }

    const elapsed = performance.now() - start;
    const perFrame = elapsed / FRAMES;

    assert.ok(
        perFrame < BUDGET_MS_PER_FRAME,
        `simulation took ${perFrame.toFixed(4)} ms/frame over ${FRAMES} frames ` +
            `(${elapsed.toFixed(1)} ms total, ${restarts} restarts)`,
    );
});
