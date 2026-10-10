/**
 * Input adapter: converts Phaser pointers (screen/design space) into
 * field-space commands for the round.
 *
 * This is the only place where rendering coordinates are translated, so the
 * game logic keeps receiving field coordinates only (AGENTS.md §4.3).
 */
import type { FieldPoint } from '../core/config.ts';
import type { FxPort } from '../core/ports.ts';
import { screenToField } from '../rendering/layout.ts';
import type { Layout } from '../rendering/layout.ts';

/** Input side of the round; implemented by `RoundSession`. */
export interface RoundInputPort {
    tapAt(point: FieldPoint): void;
    /** A slash from `from` to `to`, both already in field coordinates. */
    swipeAt(from: FieldPoint, to: FieldPoint): void;
}

interface ActiveDrag {
    fieldStart: FieldPoint;
    last: FieldPoint;
    dist: number;
    /** True once the moving finger has already reported a slash for this gesture. */
    slashed: boolean;
}

/**
 * Distance, in field units, a finger must travel before the gesture counts as a swipe.
 *
 * Distance is the *only* discriminator: a press that stays put is a tap, a press that
 * travels is a slash. Duration used to take part in the decision, and it was the wrong
 * judge on a touchscreen — the contact runs from the moment the finger lands to the moment
 * it lifts, so aiming before the flick easily outlives any window, the flick is reported
 * as a tap, and a tap only makes a wolf dodge. It read as "swiping does nothing".
 */
const SWIPE_MIN_FIELD_DISTANCE = 55;

export interface PointerSource {
    /** Subscribes to pointer-down; returns an unsubscribe function. */
    onDown(handler: PointerHandler): () => void;
    /** Subscribes to pointer-move; returns an unsubscribe function. */
    onMove(handler: PointerHandler): () => void;
    /** Subscribes to pointer-up; returns an unsubscribe function. */
    onUp(handler: PointerHandler): () => void;
}

/**
 * One sample of one contact: where it is in design space, and which pointer it belongs to.
 *
 * The id is not optional decoration: a phone is a multi-touch surface, and Phaser reports
 * every contact independently. Without it the second thumb to land overwrites the gesture
 * the first one started, and the first finger's release is then measured from the other
 * side of the screen — a plain tap is reported as a swipe and no tap reaches the round.
 */
export type PointerHandler = (x: number, y: number, pointerId: number) => void;

export interface PointerInputOptions {
    source: PointerSource;
    round: RoundInputPort;
    layout: Layout;
    fx: FxPort;
}

export interface PointerInput {
    dispose(): void;
}

/**
 * Wires pointer events to the round: a press that stays put is a tap, a press that
 * travels far enough is a swipe (the wolf's only weakness). Works with any
 * `PointerSource`, so the classification logic is testable without a scene.
 *
 * The gesture is tracked **per pointer**: a phone gets several contacts at once (a second
 * thumb, a palm resting on the glass) and Phaser reports them all independently, so one
 * shared drag would let whichever contact moved last decide what the finger that is
 * actually pressing had just done. Each contact opens its own gesture on press and closes
 * it on its own release; a contact that never pressed has nothing to contribute.
 *
 * The slash is reported **while the finger is moving**, not when it lifts. A touch
 * gesture can end without its release ever reaching the scene — the finger lifts past the
 * canvas edge, the browser cancels the touch, a host WebView swallows the event — and a
 * gesture that only settles on release then reports nothing at all: no trail, no score,
 * no reaction, which is exactly how "swiping does nothing" reads on the phone. Once the
 * path is long enough to be a slash, every further sample cuts along the path so far, so
 * the kill no longer depends on how (or whether) the gesture ends.
 */
export function attachPointerInput(options: PointerInputOptions): PointerInput {
    const { source, round, layout, fx } = options;
    const drags = new Map<number, ActiveDrag>();

    const unsubscribeDown = source.onDown((x, y, pointerId) => {
        const field = screenToField(layout, { x, y });
        drags.set(pointerId, { fieldStart: field, last: field, dist: 0, slashed: false });
    });

    const unsubscribeMove = source.onMove((x, y, pointerId) => {
        const drag = drags.get(pointerId);
        if (!drag) return;
        const field = screenToField(layout, { x, y });
        drag.dist += Math.hypot(field.x - drag.last.x, field.y - drag.last.y);
        drag.last = field;
        if (drag.dist >= SWIPE_MIN_FIELD_DISTANCE) {
            round.swipeAt(drag.fieldStart, field);
            drag.slashed = true;
        }
    });

    const unsubscribeUp = source.onUp((x, y, pointerId) => {
        const drag = drags.get(pointerId);
        if (!drag) return;
        const field = screenToField(layout, { x, y });
        // Total length of the path the finger actually took: the distance accumulated by
        // the moves, plus the closing segment to the point where the finger lifted. The
        // start must not be added again or a drifting press would count as a slash.
        const travelled =
            drag.dist + Math.hypot(field.x - drag.last.x, field.y - drag.last.y);
        const start = drag.fieldStart;
        const slashed = drag.slashed;
        drags.delete(pointerId);

        if (travelled >= SWIPE_MIN_FIELD_DISTANCE) {
            // The whole slash matters: a swipe that starts on the wolf and ends past it
            // must still connect, otherwise swiping *across* a monster feels broken. This
            // pass is also the only one for a gesture whose move samples never arrived —
            // press and lift are the whole path then — so it runs whenever the moving
            // finger has not already reported the cut.
            if (!slashed) round.swipeAt(start, field);
            fx.swipeTrail(start, field);
        } else {
            round.tapAt(start);
            fx.tapMark(start);
        }
    });

    return {
        dispose(): void {
            unsubscribeDown();
            unsubscribeMove();
            unsubscribeUp();
            drags.clear();
        },
    };
}
