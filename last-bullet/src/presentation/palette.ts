/**
 * The game's colour system.
 *
 * Everything is a flat, high-contrast fill so 120 zombies stay readable on a
 * mid-range phone at arm's length. No gradients in the world itself - the only
 * one is the pickup glow, which exists purely to make the bullet findable.
 */

/** Page background, also the arena floor. */
export const NIGHT = '#0b0f1a';
export const NIGHT_HEX = 0x0b0f1a;
/** Faint grid line colour, baked into the tile. */
export const GRID_HEX = 0x182036;

export const PAPER = '#f2f5ff';
export const PAPER_HEX = 0xf2f5ff;
export const SLATE = '#8f9bb3';
export const SLATE_HEX = 0x8f9bb3;
export const INK = '#0b0f1a';
export const INK_HEX = 0x0b0f1a;

/** Player, and the "you are armed" accent. */
export const CYAN = '#48e0c8';
export const CYAN_HEX = 0x48e0c8;
/** The bullet, the XP bar and anything worth wanting. */
export const AMBER = '#ffc857';
export const AMBER_HEX = 0xffc857;
/** Fast zombies, damage and the low-heart warning. */
export const CORAL = '#ff5d73';
export const CORAL_HEX = 0xff5d73;
/** Tanks. */
export const VIOLET = '#9b6cff';
export const VIOLET_HEX = 0x9b6cff;
/** The XP bar, and anything the player is collecting toward. */
export const LIME = '#8ee86b';
export const LIME_HEX = 0x8ee86b;
/** Zombies. */
export const MOSS = '#5fbf6a';
export const MOSS_HEX = 0x5fbf6a;

/** Level-up cards sit on this. */
export const CARD_HEX = 0x141b2e;
export const CARD_STROKE_HEX = 0x2b3a5c;

export const ENEMY_HEX: Readonly<Record<'zombie' | 'fast' | 'tank', number>> = {
  zombie: MOSS_HEX,
  fast: CORAL_HEX,
  tank: VIOLET_HEX,
};

/** `#rrggbb` -> number, for the handful of places that need Phaser's form. */
export const toHex = (color: string): number => Number.parseInt(color.slice(1), 16);
