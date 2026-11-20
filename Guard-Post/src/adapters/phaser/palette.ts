/**
 * The single source of truth for the grass-and-sand art direction.
 *
 * Every surface — board, chrome, text and accents — is expressed with the tones below.
 * Nothing else in the renderer should invent a hex colour: add a tone here and give it
 * a name instead. Keeping the palette in one dependency-free module makes the look easy
 * to audit and change without touching any drawing code.
 */
export const PALETTE = {
    // Dark green inks: outlines, shadows and the game field behind the board.
    ink: 0x0a1a10,
    void: 0x102318,
    deep: 0x142a1c,

    // Grass: ground, panels and the cooler UI surfaces.
    grassDark: 0x1d4a2c,
    grass: 0x2f6b3f,
    leaf: 0x4f8f4f,
    moss: 0x79a85c,
    sage: 0xc2d3a6,
    // Themed variants: a cooler jade and a warmer olive, both still grassy.
    jadeDark: 0x154a35,
    jade: 0x1e6e50,
    jadeLight: 0x27835d,
    oliveDark: 0x454a27,
    olive: 0x6b7a3a,
    oliveLight: 0x7d8b45,

    // Sand: paths, pads, gold accents and the warmer UI surfaces.
    sandDeep: 0x6f5426,
    sandShade: 0xa8843d,
    ochre: 0xd99a4e,
    sand: 0xd9c27a,
    sandLight: 0xf2e2a8,
    wheat: 0xe8bd83,
    cream: 0xf6efd2,

    // Accents kept in the same earthy family so nothing looks pasted on.
    clayDark: 0x4a2018,
    clayShade: 0x8d3f30,
    clay: 0xc4614a,
    clayLight: 0xe89076,
    mintDark: 0x2f5f56,
    mint: 0x9fd8c8,
    // Enemy and scenery accents: muted enough to sit on grass and sand.
    plum: 0x9a7fb5,
    plumLight: 0xb79ae0,
    berry: 0xb84455,
    berryLight: 0xd45a70,
    stone: 0x6d7280,
    stoneLight: 0x9aa3b4,
    flash: 0xffffff,
} as const;

export type PixelVariant =
    | 'panel'
    | 'plaque'
    | 'capsule'
    | 'button'
    | 'primary'
    | 'danger'
    | 'disabled'
    | 'dart'
    | 'cannon'
    | 'frost';

export interface PixelPalette {
    readonly body: number;
    readonly light: number;
    readonly shade: number;
    readonly border: number;
}

/**
 * One flat palette per UI surface. Greens carry the neutral chrome, sand carries the
 * forward actions and the title plaque, and the three tower buttons borrow a tone from
 * their own sprite.
 */
export const UI_PALETTE: Record<PixelVariant, PixelPalette> = {
    panel: {
        border: PALETTE.ink,
        body: PALETTE.grassDark,
        light: PALETTE.grass,
        shade: PALETTE.deep,
    },
    plaque: {
        border: PALETTE.sand,
        body: PALETTE.grassDark,
        light: PALETTE.sandLight,
        shade: PALETTE.sandShade,
    },
    capsule: {
        border: PALETTE.ink,
        body: PALETTE.grass,
        light: PALETTE.leaf,
        shade: PALETTE.grassDark,
    },
    button: {
        border: PALETTE.ink,
        body: PALETTE.grass,
        light: PALETTE.leaf,
        shade: PALETTE.grassDark,
    },
    primary: {
        border: PALETTE.sandDeep,
        body: PALETTE.sand,
        light: PALETTE.sandLight,
        shade: PALETTE.sandShade,
    },
    danger: {
        border: PALETTE.clayDark,
        body: PALETTE.clay,
        light: PALETTE.clayLight,
        shade: PALETTE.clayShade,
    },
    disabled: {
        border: PALETTE.ink,
        body: PALETTE.deep,
        light: PALETTE.grassDark,
        shade: PALETTE.void,
    },
    dart: {
        border: PALETTE.grassDark,
        body: PALETTE.grass,
        light: PALETTE.moss,
        shade: PALETTE.deep,
    },
    cannon: {
        border: PALETTE.sandDeep,
        body: PALETTE.sandShade,
        light: PALETTE.ochre,
        shade: PALETTE.sandDeep,
    },
    frost: {
        border: PALETTE.mintDark,
        body: PALETTE.mintDark,
        light: PALETTE.mint,
        shade: PALETTE.deep,
    },
};
