/**
 * The game's colour and typography — data, and nothing else.
 *
 * Every colour the player sees lives in one place so the palette can be
 * reviewed at a glance: surfaces, world entities, text, buttons. Scenes and
 * adapters pick from it; they never invent hex codes of their own.
 *
 * Division of labour on the presentation side:
 *
 *   theme.ts   — what things look like (this file: no logic, no imports)
 *   layout.ts  — where things go (pure maths over a Viewport, unit tested)
 *   ui.ts      — how things are drawn (Canvas 2D textures + widgets)
 *   scenes     — wiring: measure the screen, ask for a layout, build, hook up
 */

import type { BrickKind, PowerUpKind } from '../../domain/types.ts';

/** System font stack — no bundled assets, crisp on every device. */
export const FONT = 'system-ui, sans-serif';

/** Falling pickups, keyed by power-up kind. */
const DROP_COLORS: Record<PowerUpKind, number> = {
    multi: 0xffd23f,   // yellow — +1 ball (the one you want)
    wide: 0x4cd964,    // green — wide paddle
    slow: 0x5ac8fa,    // blue — slow ball
    fire: 0xff6b3d,    // orange — fireball
    shield: 0xaf52de,  // purple — shield
    shrink: 0x8e8e93,  // grey — the bad one
};

/**
 * The two armoured kinds keep fixed, unmistakable colours; basic bricks are
 * coloured by row from `brickRows` instead (see below).
 */
const BRICK_COLORS: Record<BrickKind, number> = {
    basic: 0xffffff,   // unused — basics take the row sweep
    sturdy: 0x4cd964,
    tough: 0xff9500,
};

export const THEME = {
    // ---- surfaces ----
    /** Backdrop gradient, top → bottom; style.css mirrors it on the page. */
    backdropTop: 0x2b1b5e,
    backdropMid: 0x16204a,
    backdropBottom: 0x0b1020,
    /** Tinted band the HUD row sits on. */
    hudBand: 0x5e5ce6,
    pauseDim: 0x1b1140,

    // ---- world entities ----
    paddle: 0x64d2ff,
    shield: 0xaf52de,
    ball: 0xffffff,
    ballGlow: 0x66d9ff,
    fireball: 0xff6b3d,
    fireballGlow: 0xff9f0a,
    /** Damaged bricks dim towards this. */
    brickDamaged: 0x3a3a3c,

    /**
     * Brick colours. Basic bricks sweep this cool spectrum row by row (sky →
     * blue → violet → rose), so a dense wave still reads as colour, while the
     * fixed green/orange of the armoured kinds stay free and unmistakable.
     */
    brickRows: [
        0x5ac8fa, 0x36a2eb, 0x4c6fff, 0x5e5ce6,
        0x8b5cf6, 0xaf52de, 0xff375f, 0xff6482,
    ],
    bricks: BRICK_COLORS,
    drops: DROP_COLORS,

    // ---- HUD text ----
    score: '#ffd23f',
    wave: '#64d2ff',
    balls: '#32d74b',
    banner: '#ffd23f',
    bannerStroke: '#af52de',
    serve: '#64d2ff',
    serveStroke: '#141a34',
    combo: '#ff375f',
    comboStroke: '#ffffff',

    // ---- screen text ----
    title: '#ffd23f',
    titleStroke: '#af52de',
    howTo: '#e6e9ff',
    paused: '#ffd23f',
    pausedStroke: '#af52de',
    resultHeadline: '#ff453a',
    resultHeadlineStroke: '#ffd23f',
    resultWave: '#ffd23f',
    resultScore: '#64d2ff',

    // ---- buttons ----
    /** Gradients, top → bottom. */
    play: { top: 0xffd23f, bottom: 0xff9500 },
    resume: { top: 0x0a84ff, bottom: 0x64d2ff },
    retry: { top: 0x30d158, bottom: 0x0a9e5b },
    exit: { top: 0x5e5ce6, bottom: 0xaf52de },
    pauseButton: 0x5e5ce6,
    buttonLabel: '#ffffff',
    /** Dark labels read better on the warm PLAY gradient. */
    buttonLabelWarm: '#101426',
};
