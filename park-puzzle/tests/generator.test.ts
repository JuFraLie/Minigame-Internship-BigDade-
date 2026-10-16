import test from "node:test";
import assert from "node:assert/strict";
import { generateLevel } from "../src/core/generator.ts";
import { levelSpec } from "../src/core/config.ts";
import { directionVector } from "../src/core/ring.ts";
import type { CarSpec } from "../src/core/world.ts";
import { seededRandom } from "./helpers.ts";

function bodyCells(car: CarSpec): { x: number; y: number }[] {
    const { dx, dy } = directionVector(car.dir);
    const cells: { x: number; y: number }[] = [];
    for (let k = 0; k < car.length; k++) cells.push({ x: car.col - dx * k, y: car.row - dy * k });
    return cells;
}

/** The straight corridor the car drives out through, nose to the edge of the lot. */
function exitPath(car: CarSpec, cols: number, rows: number): { x: number; y: number }[] {
    const { dx, dy } = directionVector(car.dir);
    const cells: { x: number; y: number }[] = [];
    for (let step = 0; step < Math.max(cols, rows); step++) {
        const x = car.col + dx * step;
        const y = car.row + dy * step;
        if (x < 0 || x >= cols || y < 0 || y >= rows) break;
        cells.push({ x, y });
    }
    return cells;
}

test("generated cars are in bounds, non-overlapping, and inside the car-count band", () => {
    const bands = [1, 4, 9, 16, 40];
    for (const level of bands) {
        const spec = levelSpec(level);
        for (let seed = 1; seed <= 30; seed += 1) {
            const cars = generateLevel(spec, seededRandom(seed * 7919 + level));
            assert.ok(
                cars.length >= spec.minCars && cars.length <= spec.maxCars,
                `level ${level} seed ${seed}: ${cars.length} cars outside [${spec.minCars}, ${spec.maxCars}]`,
            );

            const occupied = new Set<string>();
            for (const car of cars) {
                const cells = bodyCells(car);
                assert.equal(cells.length, car.length);
                for (const cell of cells) {
                    assert.ok(cell.x >= 0 && cell.x < spec.cols && cell.y >= 0 && cell.y < spec.rows, "body in bounds");
                    const key = `${cell.x},${cell.y}`;
                    assert.ok(!occupied.has(key), `overlap at ${key}`);
                    occupied.add(key);
                }
            }
            assert.equal(occupied.size, cars.reduce((n, c) => n + c.length, 0));
        }
    }
});

test("reverse placement order is a valid exit order", () => {
    for (let level = 1; level <= 20; level += 1) {
        const spec = levelSpec(level);
        for (let seed = 1; seed <= 15; seed += 1) {
            const cars = generateLevel(spec, seededRandom(seed * 104729 + level));
            const alreadyGone = new Set<CarSpec>();

            for (const car of cars) {
                // Placement order runs opposite to exit order: everything placed BEFORE
                // `car` is still parked when `car` leaves, so those are the only bodies
                // that may sit in its corridor.
                for (const other of alreadyGone) {
                    const path = exitPath(car, spec.cols, spec.rows);
                    const otherBody = bodyCells(other);
                    const blocked = path.some((p) => otherBody.some((b) => b.x === p.x && b.y === p.y));
                    assert.ok(!blocked, `level ${level} seed ${seed}: an earlier car blocks this exit path`);
                }
                alreadyGone.add(car);
            }
        }
    }
});

test("car lengths stay inside the level band and the layout is stable across reruns", () => {
    for (let level = 1; level <= 60; level += 1) {
        const spec = levelSpec(level);
        const first = generateLevel(spec, seededRandom(level * 31 + 5));
        const second = generateLevel(spec, seededRandom(level * 31 + 5));
        assert.deepEqual(first, second, "the same seed must rebuild the same level");

        for (const car of first) {
            assert.ok(car.length >= spec.minLength && car.length <= spec.maxLength, `level ${level}: bad length`);
            assert.ok(["up", "down", "left", "right"].includes(car.dir));
            const body = bodyCells(car);
            assert.ok(body.every((c) => c.x >= 0 && c.x < spec.cols && c.y >= 0 && c.y < spec.rows));
        }
    }
});
