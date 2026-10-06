/**
 * The single source of truth for the game's art direction.
 *
 * The look is "paper and ink": a painted warm-paper backdrop, a soft plum
 * ink used for every outline and every letter, and a small set of muted
 * gouache accents. Textures, HUD and screens all read their colours from
 * here, so restyling the game means editing this one file.
 *
 * Two lettering rules keep the screens coherent:
 *
 *   ink lettering     → dark fill with a cream halo. Quiet, printed.
 *   gouache lettering → mid-tone fill with an ink outline. Outlined, lively.
 */

// ── Paper ────────────────────────────────────────────────────────────────────

/** Top of the backdrop: warm, nearly white paper. */
export const PAPER = '#fbf7f0';
/** Where the gradient begins to cool. */
export const PAPER_MID = '#f3ece2';
/** Bottom of the backdrop: a lilac mist, so the sky reads as painted. */
export const PAPER_DEEP = '#e8e2ee';

// ── Ink ──────────────────────────────────────────────────────────────────────

/** Soft plum ink — every outline, pupil and letter in the game. */
export const INK = '#3b3654';
/** Muted ink for small supporting copy. */
export const INK_SOFT = '#6b6486';
/** Warm white: the body colour of every painted shape, and light lettering. */
export const CREAM = '#fffaf1';
export const WHITE = '#ffffff';

// ── Gouache accents ──────────────────────────────────────────────────────────

export const TERRACOTTA = '#e07a55';
export const CLAY = '#d96f5c';
export const SAGE = '#4f9e85';
export const SKY = '#6f95c9';
export const AMBER = '#e3a34b';
export const ROSE = '#ee8ba3';

/** Muted plum ceramic of the enemy badge — cream shapes read clearly on it. */
export const BADGE_PLATE = '#5b5478';
/** The emptied heart: a quiet lilac grey instead of a dead black. */
export const HEART_EMPTY = '#c6bfd4';

/** Supporting pastels, one per cosmetic enemy look. */
export const LILAC = '#b7a6e8';
export const SAND = '#f2c591';
export const PERIWINKLE = '#a8c6f0';
export const AQUA = '#9fd8e0';
export const MINT = '#a9dcb8';

// ── Result banner ────────────────────────────────────────────────────────────

/** The three outcomes of a clash, as gouache lettering colours. */
export const RESULT_COLOR = {
  WIN: SAGE,
  LOSE: CLAY,
  TIE: AMBER,
} as const;

/** Phaser paints with numbers: the hex digits, prefixed with `0x`. */
export const toHex = (cssColor: string): number => parseInt(cssColor.slice(1), 16);
