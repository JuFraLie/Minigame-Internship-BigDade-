/**
 * The game's light theme, in one place.
 *
 * The light theme holds two ideas:
 *
 * - The app chrome — page, cards, buttons — is light: pale surfaces, dark slate text.
 * - The board itself is black asphalt, the real colour of a road, so the cars and the
 *   yellow lane markings pop exactly the way they do on a real ring road.
 *
 * Text and strokes are dark slate, never white, so they keep their contrast against
 * the pale chrome. White is only used as a *label on a filled button*, where the
 * button itself is what carries the contrast.
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
        /** The same label ink as a number, for Graphics strokes over a filled badge. */
        onFillNumber: 0xffffff,
        /** Loss / fenders-remaining red. */
        danger: '#d64545',
        /** The same red as a number, for Graphics fills (the loss badge). */
        dangerNumber: 0xd64545,
        /** Accent: title flourish, combo, score, the padlock. */
        accent: '#d97706',
        /** The same accent as a number, for Graphics fills (badges, rules, dividers). */
        accentNumber: 0xd97706,
    },

    board: {
        /** The ring road slab: black asphalt, the one dark surface in a light UI. */
        road: 0x1e2126,
        roadEdge: 0x3a414a,
        /** Lane dashes down each road edge — classic warm road-marking yellow. */
        lane: 0xe8b45c,
        /** The parking apron inside the ring, a shade lighter than the road. */
        lot: 0x2c323a,
        lotEdge: 0x4c5665,
        lotLine: 0x97a2b0,
    },

    /** Entry-window pulses over the ring cells a car needs. Tuned to read on black. */
    pulse: {
        blocked: 0xff4d4d,
        open: 0x7fb0ff,
    },

    /** The padlock over a blocked car: bright gold, the one accent that lives on black. */
    lock: '#ffd166',

    /** Vehicles: the light rim baked around every body so it reads on the black road. */
    vehicle: {
        outline: '#f4f7fb',
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

    /** HUD chips — small white cards floating over the asphalt board. */
    chip: {
        fill: 0xffffff,
        stroke: 0xd3dae4,
        /** Combo/bus highlight chip: a wash of the accent colour. */
        accentFill: 0xfdf0d5,
        accentStroke: 0xe8c98a,
    },

    /** Result Panel backdrops — a tint of the outcome, not a full colour change. */
    result: {
        winBg: 0xe3f5ea,
        loseBg: 0xfdeaea,
    },

    /**
     * The Play Screen only — the one screen that leaves the light chrome behind for an
     * arcade dusk sky, so its colours live apart from the light theme above. Everything
     * on it is chunky: one dark outline (`ink`) on every shape, amber plates, cream ink.
     */
    menu: {
        /** Sky wash, top → bottom. Drawn as stepped bands: Canvas has no gradient fill. */
        sky: [0x121436, 0x3a2069, 0x7a2f74],
        /** Sunburst wedges turning slowly behind the logo. */
        ray: 0xffb25c,
        /** Twinkle specks over the sky. */
        star: 0xffe9a8,
        /** The single outline colour every chunk on this screen wears. */
        ink: 0x191034,
        inkCss: '#191034',
        /** The darker ink a drop shadow uses, so a shadow reads under the outline. */
        shadowCss: '#0d0922',
        /** Logo and button label ink. */
        logoInk: '#fff6e6',
        /** Amber plate under the second title line, and the how-to tab. */
        plate: 0xff8c1a,
        /** Sticker card behind the how-to. */
        card: 0xfff7e8,
        cardInkCss: '#2b2440',
        /** How-to step badges, alternating orange / green. */
        badge: [0xff7a29, 0x2ea85f],
        /** Pressable green, top half (highlight) and bottom half (body). */
        goTop: 0x4ad97f,
        goBottom: 0x1f9d55,
        /** Hint under the button. */
        hintCss: '#ffd9a1',
    },
} as const;
