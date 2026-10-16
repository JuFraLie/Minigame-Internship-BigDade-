import test from "node:test";
import assert from "node:assert/strict";
import { RoundSession } from "../src/app/roundSession.ts";
import { fakeBridge, seededRandom } from "./helpers.ts";

/**
 * Taps every waiting car every frame until the round ends.
 *
 * The world decides which taps are legal, so this brute-force driver always terminates:
 * either the lot empties (win) or the fenders run out (loss). Both end the round.
 */
function playToEnd(session: RoundSession): void {
    for (let i = 0; i < 6000 && !session.roundOver; i += 1) {
        for (const car of [...session.world.parked]) session.tapCell(car.col, car.row);
        session.update(1 / 60);
    }
}

test("a round reports startRound once and endRound exactly once", () => {
    const bridge = fakeBridge();
    const session = new RoundSession({ bridge, random: seededRandom(3), level: 1 });

    session.startRound();
    assert.deepEqual(bridge.calls.map((c) => c.type), ["startRound"]);

    playToEnd(session);
    assert.ok(session.roundOver, "the round should have ended");

    const first = session.finishRound();
    const second = session.finishRound();
    assert.ok(first, "the first finish must report a result");
    assert.equal(second, null, "the second finish must be a no-op");

    const types = bridge.calls.map((c) => c.type);
    assert.deepEqual(types, ["startRound", "endRound"]);
    assert.equal(bridge.calls[1].win, first.win);
    assert.equal(bridge.calls[1].score, first.score);
});

test("taps and updates after the round ends are ignored", () => {
    const bridge = fakeBridge();
    const session = new RoundSession({ bridge, random: seededRandom(11), level: 1 });
    session.startRound();

    playToEnd(session);
    const result = session.finishRound();
    assert.ok(result);

    session.update(1 / 60);
    session.tapCell(0, 0);
    session.finishRound();

    assert.equal(bridge.calls.filter((c) => c.type === "endRound").length, 1);
});

test("the fixed-step accumulator advances the world in whole ticks", () => {
    const bridge = fakeBridge();
    const session = new RoundSession({ bridge, random: seededRandom(5), level: 1 });
    session.startRound();

    const before = session.world.elapsed;
    // One huge frame and one tiny frame must both land on whole ticks.
    session.update(0.9);
    const afterHuge = session.world.elapsed;
    session.update(0.001);

    const step = 1 / 60;
    const ticksHuge = Math.round((afterHuge - before) / step);
    const ticksTotal = Math.round((session.world.elapsed - before) / step);
    assert.ok(Math.abs(afterHuge - before - ticksHuge * step) < 1e-9, "elapsed must move in whole ticks");
    assert.ok(ticksTotal >= ticksHuge, "the small frame may not rewind the world");
    assert.ok(ticksHuge <= 6, "catch-up must be capped so a hitch cannot freeze the next frame");
});
