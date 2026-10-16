import test from "node:test";
import assert from "node:assert/strict";
import { GameWorld } from "../src/core/world.ts";
import { TICK_SECONDS } from "../src/core/config.ts";
import { seededRandom } from "./helpers.ts";

// Headless throughput guard: the scene runs a fixed 60 Hz domain tick, so one tick must
// stay far below the ~16 ms frame budget even on a slow phone.
const TICK_BUDGET_MS = 4;
const SIM_TICKS = 6000; // 100 simulated seconds

test("a long headless run keeps a comfortable per-tick budget", () => {
    const world = new GameWorld(seededRandom(20261016), 12);
    const t0 = performance.now();

    let ticks = 0;
    while (world.phase === "playing" && ticks < SIM_TICKS) {
        // Tap whatever car sits up front every so often, so the leaving/entry/crash
        // paths are exercised rather than just an idle ring.
        if (ticks % 90 === 0 && world.parked.length > 0) {
            const car = world.parked[world.parked.length - 1];
            world.tapCell(car.col, car.row);
        }
        world.tick();
        ticks += 1;
    }

    const perTick = (performance.now() - t0) / ticks;
    assert.ok(perTick < TICK_BUDGET_MS, `per-tick cost ${perTick.toFixed(3)} ms exceeds ${TICK_BUDGET_MS} ms`);
    assert.ok(ticks > 600, `round ended suspiciously fast after ${ticks} ticks`);
});

test("many ticks at a high level do not grow the heap without bound", () => {
    const world = new GameWorld(seededRandom(7), 20);
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 3000 && world.phase === "playing"; i += 1) world.tick();

    const growthMb = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
    assert.ok(growthMb < 40, `heap grew ${growthMb.toFixed(1)} MB over 3000 ticks`);
});

test("the fixed tick is a whole frame at 60 Hz", () => {
    assert.ok(Math.abs(TICK_SECONDS - 1 / 60) < 1e-12);
});
