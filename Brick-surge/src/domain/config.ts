/** Tunable constants for the game world, in world units (world is always 100 wide). */

import type { PowerUpKind } from './types.ts';

export const WORLD_WIDTH = 100;

/** The world is 100 wide; its height follows the screen aspect ratio. These are the
 *  fractions used to place zones for any height. */
export const HUD_TOP_FRAC = 0.08;      // reserve the top 8% for the HUD (cutout safe)
export const BRICK_TOP_FRAC = 0.15;    // first brick row starts at 15% of height

export const BALL_RADIUS = 1.8;       // slightly bigger ball: easier to read and catch
export const BASE_BALL_SPEED = 95;    // world units / second — Ballz-like leisurely pace
export const MAX_BALL_SPEED = 120;    // hard cap — DDA can never exceed this

export const PADDLE_WIDTH = 20;
export const PADDLE_HEIGHT = 3;
export const PADDLE_MIN_WIDTH = 12;    // hard floor — DDA can never go below this
export const PADDLE_MAX_WIDTH = 30;
export const PADDLE_BOTTOM_MARGIN = 8; // paddle centre is this far above the bottom

export const SHIELD_Y_FRAC = 0.985;    // shield line sits just above the world bottom

export const BRICK_COLS = 8;
export const BRICK_W = 11.4;
export const BRICK_H = 4.5;
export const BRICK_GAP = 0.8;
/** Hard cap per wave: 12 rows x 8 columns of the endless field. */
export const MAX_BRICKS = 96;

/** Balls the player starts a round with; every catchable "+1 ball" pickup grows this. */
export const START_BALLS = 1;
/** Hard cap on simultaneous balls — also the frame-rate rule (AGENTS.md §4.4). */
export const MAX_BALLS = 6;

/**
 * Rows per wave: dense from the start, then one extra row per wave in the
 * endless run (waves 4+) until this cap. The growing volley is meant to meet
 * a field that keeps getting fuller — that is where the late-run pressure
 * comes from, on top of whatever the DDA decides.
 */
export const MAX_WAVE_ROWS = 12;

export const BANNER_SECONDS = 1;       // "Wave 2" banner between waves
export const BASE_SERVE_SECONDS = 1.5; // countdown before the next ball is served

export const COMBO_MAX = 5;
export const POWERUP_POINTS = 50;
/** Wave-clear bonus per ball still in the player's possession. */
export const WAVE_BONUS_PER_BALL = 100;

/** Falling speed of power-up drops, world units / second (slow = easy to catch). */
export const DROP_FALL_SPEED = 14;

/** Fixed logic step (120 Hz) — rendering may run faster or slower. */
export const FIXED_STEP = 1 / 120;

export const BRICK_POINTS: Record<'basic' | 'sturdy' | 'tough', number> = {
    basic: 10,
    sturdy: 20,
    tough: 30,
};

export const BRICK_HP: Record<'basic' | 'sturdy' | 'tough', number> = {
    basic: 1,
    sturdy: 2,
    tough: 3,
};

/**
 * Base (neutral) power-up drop weights; the shrink weight is DDA-adjusted at
 * roll time. Multi-ball dominates: the whole game is about growing the volley
 * (Ballz-style) — every other drop is a supporting act.
 */
export const DROP_WEIGHTS: Record<PowerUpKind, number> = {
    multi: 55,
    wide: 20,
    slow: 15,
    fire: 10,
    shield: 12,
    shrink: 2,
};
