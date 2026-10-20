/**
 * The game's palette, in one place.
 *
 * The game draws in one style — the arcade dusk sky — on every screen: the Play Screen,
 * the gameplay HUD, the pause sheet and the Result Panel. What ties them together is that
 * one shape wears one outline: `menu.ink`, a heavy near-black purple, on every card, plate
 * and slab, each with an extruded shadow and a glossy top strip. Amber plates, cream sticker
 * cards and green pressable slabs are the fills that sit inside it.
 *
 * The board itself is black asphalt, the real colour of a road, so the cars and the yellow
 * lane markings pop exactly the way they do on a real ring road. It takes the same ink
 * outline as everything else, so it reads as a sticker laid on the sky rather than as a hole
 * cut in it.
 *
 * Numbers are `0xrrggbb` for Graphics fills/strokes and `#rrggbb` strings for text and
 * camera backgrounds — the two forms are kept as parallel pairs so a colour can never
 * drift between the two drawing APIs.
 */
export const THEME = {
    /** Page and camera background — the frame everything else sits on. */
    bgCss: '#eef1f6',

    /**
     * Scene fades ramp to this rather than to black, so a change of screen reads as a
     * bright blink instead of the frame momentarily dying.
     */
    fade: { r: 255, g: 255, b: 255 },

    text: {
        /** Default copy ink wherever a screen does not name one. */
        primary: '#23303f',
        /** Label on a filled (primary/danger) button, where the fill carries contrast. */
        onFill: '#ffffff',
        /** The same red as a number, for Graphics fills (the loss badge). */
        dangerNumber: 0xd64545,
        /** Accent: title flourish, combo, score, the padlock. */
        accent: '#d97706',
    },

    board: {
        /** The ring road slab: black asphalt, the one dark surface behind the cars. */
        road: 0x1e2126,
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
        /** RETRY, and the fenders chip in the gameplay HUD. */
        danger: { fill: 0xe2691a },
    },

    panel: {
        /** Overlay dim: a soft slate veil, not a blackout. */
        dim: 0x273449,
        dimAlpha: 0.5,
    },

    /** Result Panel backdrops — a tint of the outcome, not a full colour change. */
    result: {
        winBg: 0xe3f5ea,
        loseBg: 0xfdeaea,
    },

    /**
     * The arcade look, shared by every screen: the Play Screen, the gameplay HUD, the pause
     * sheet and the Result Panel. Everything on it is chunky — one dark outline (`ink`) on
     * every shape, amber plates, cream sticker cards, green pressable slabs.
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
        /** The same ink as a number, for Graphics fills (the verdict seal's mark). */
        logoInkNumber: 0xfff6e6,
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
