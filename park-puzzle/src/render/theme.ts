/**
 * The game's light theme, in one place.
 *
 * Every screen draws its pixels from these tokens, so the palette is changed by editing
 * this file rather than by chasing hex literals through the views. Two conventions hold
 * the light theme together:
 *
 * - Surfaces get lighter as they come forward: page < road < lot < card. The board is a
 *   pale slate slab and the parking apron is the lightest thing on it, so the bays read
 *   as "the place cars go" without a single label.
 * - Text and strokes are dark slate, never white, so they keep their contrast against
 *   the pale surfaces. White is only used as a *label on a filled button*, where the
 *   button itself is what carries the contrast.
 *
 * Numbers are `0xrrggbb` for Graphics fills/strokes and `#rrggbb` strings for text and
 * camera backgrounds — the two forms are kept as parallel pairs so a colour can never
 * drift between the two drawing APIs.
 */
export const THEME = {
    /** Page and camera background — the frame everything else sits on. */
    bg: 0xeef1f6,
    bgCss: '#eef1f6',

    /** Scene fades dim to the page colour, not to black: a light theme never goes dark. */
    fade: { r: 255, g: 255, b: 255 },

    text: {
        /** Primary copy: headings, the score, button labels on pale fills. */
        primary: '#23303f',
        /** Secondary copy: subtitles, stat lines. */
        muted: '#5c6b7d',
        /** Label on a filled (primary/danger) button, where the fill carries contrast. */
        onFill: '#ffffff',
        /** Loss / fenders-remaining red. */
        danger: '#d64545',
        /** Accent: title flourish, combo, score, the padlock. */
        accent: '#d97706',
    },

    board: {
        /** The ring road slab. */
        road: 0xd9dfe8,
        roadEdge: 0xc2cbd8,
        /** Lane dashes down each road edge — a warm amber survives on pale slate. */
        lane: 0xe8a13a,
        /** The parking apron inside the ring, ruled into bays. */
        lot: 0xf7f9fc,
        lotEdge: 0xd5dce7,
        lotLine: 0xc9d2de,
    },

    /** Entry-window pulses over the ring cells a car needs. */
    pulse: {
        blocked: 0xff4d4d,
        open: 0x3b82f6,
    },

    button: {
        /** PLAY / RESUME / NEXT LEVEL. */
        primary: { fill: 0x2ea85f, stroke: 0x1f8c4d },
        /** RETRY. */
        danger: { fill: 0xe2691a, stroke: 0xc55a12 },
        /** EXIT, pause pill — quiet, pale, dark label. */
        neutral: { fill: 0xdfe5ee, stroke: 0xb9c3d1 },
    },

    panel: {
        /** Pause and result cards. */
        fill: 0xffffff,
        stroke: 0xd3dae4,
        /** Overlay dim: a soft slate veil, not a blackout. */
        dim: 0x273449,
        dimAlpha: 0.5,
        /** Lighter veil for the Result Panel, whose tinted backdrop must stay readable. */
        dimAlphaSoft: 0.28,
    },

    /** Result Panel backdrops — a tint of the outcome, not a full colour change. */
    result: {
        winBg: 0xe3f5ea,
        loseBg: 0xfdeaea,
    },
} as const;
