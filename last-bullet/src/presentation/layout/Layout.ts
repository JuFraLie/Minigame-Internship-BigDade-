/**
 * The rendering world's geometry: screen pixels of the *current* device,
 * recomputed whenever the canvas resizes.
 *
 * Two rules shape every number here:
 *
 *  - portrait, edge-to-edge, any height - nothing is positioned from a fixed
 *    design resolution, it is derived from `width` / `height` on the spot;
 *  - top padding - the HUD starts below the status bar and the notch, so the
 *    player's score is never hidden behind them.
 *
 * The game world never sees any of this.
 */

export interface PlayLayout {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly topPad: number;
  readonly titleY: number;
  /** Under the title, with enough gap that two 76 px strokes never touch. */
  readonly subtitleY: number;
  /** Above the Play button, clear of the zombie ring that circles the hero. */
  readonly hintY: number;
  readonly heroY: number;
  readonly playY: number;
}

export interface HudLayout {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly topPad: number;
  /** Centre of the hearts row. */
  readonly heartsY: number;
  readonly heartsX: number;
  readonly heartSize: number;
  readonly heartGap: number;
  /**
   * Centre of the wave readout, on the score row rather than level with the
   * hearts: a `NEXT 8` beside five hearts was running into the last one.
   */
  readonly waveY: number;
  /** Centre of the big wave banner, well clear of the HUD. */
  readonly bannerY: number;
  /**
   * Centre of the breather countdown. Deliberately between the banner and the
   * player - the camera pins the player to the middle of the screen, so a
   * number parked on the centre point would cover the one thing being played.
   */
  readonly countdownY: number;
  readonly pauseX: number;
  readonly pauseY: number;
  readonly pauseSize: number;
  /** Left-aligned live score; `origin` is 0,0. */
  readonly scoreY: number;
  readonly scoreX: number;
  /** Right-aligned chamber pips. */
  readonly chamberY: number;
  readonly chamberRight: number;
  readonly pipSize: number;
  readonly pipGap: number;
  /** XP bar. */
  readonly xpY: number;
  readonly xpHeight: number;
  readonly xpInset: number;
  readonly levelY: number;
}

export interface OverlayLayout {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly topPad: number;
  readonly titleY: number;
  /** Top edge of the first card. */
  readonly cardsY: number;
  readonly cardX: number;
  readonly cardW: number;
  readonly cardH: number;
  readonly cardGap: number;
}

export interface ResultLayout {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly topPad: number;
  readonly titleY: number;
  readonly scoreLabelY: number;
  readonly scoreValueY: number;
  readonly statsY: number;
  readonly retryY: number;
  readonly exitY: number;
}

const REF_WIDTH = 390;
const REF_HEIGHT = 760;
const SIDE = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Global scale: 1 means "a 390 x 760 phone". */
export const unitFor = (width: number, height: number): number =>
  clamp(Math.min(width / REF_WIDTH, height / REF_HEIGHT), 0.72, 1.9);

/**
 * The device inset for a status bar or a notch, read once from CSS.
 *
 * `env(safe-area-inset-top)` cannot be queried directly, so a zero-height
 * probe element carries it and we measure the padding it computes. Where the
 * environment does not define it the probe reads 0 and the percentage below
 * still reserves room (AGENTS.md A3.1).
 */
let safeTopCache: number | null = null;
const readSafeTop = (): number => {
  if (safeTopCache !== null) return safeTopCache;
  safeTopCache = 0;
  if (typeof document === 'undefined') return safeTopCache;

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:0;left:0;height:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top);pointer-events:none';
  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().height;
  probe.remove();

  if (Number.isFinite(measured)) safeTopCache = measured;
  return safeTopCache;
};

/** Never less than 3.5 % of the screen, and always clear of the safe area. */
export const topPadFor = (height: number, unit: number): number =>
  Math.max(height * 0.035, readSafeTop() + 12 * unit);

export const computePlayLayout = (width: number, height: number): PlayLayout => {
  const unit = unitFor(width, height);
  const topPad = topPadFor(height, unit);
  const titleY = topPad + height * 0.13;
  const playY = height * 0.82;

  return {
    width,
    height,
    unit,
    topPad,
    titleY,
    // 76 px type needs more than the 58 it used to get: at that gap the
    // stroke under "LAST" was landing on the caps of "BULLET".
    subtitleY: titleY + 74 * unit,
    // The how-to reads best next to the button it explains, and down there
    // it is clear of the ring of zombies that closes in on the hero.
    hintY: playY - 78 * unit,
    heroY: height * 0.5,
    playY,
  };
};

export const computeHudLayout = (width: number, height: number): HudLayout => {
  const unit = unitFor(width, height);
  const topPad = topPadFor(height, unit);
  const heartsY = topPad + 17 * unit;
  const pauseSize = 40 * unit;

  return {
    width,
    height,
    unit,
    topPad,
    heartsY,
    heartsX: SIDE * unit,
    heartSize: 24 * unit,
    heartGap: 5 * unit,
    waveY: heartsY + 32 * unit,
    // Up a touch from 0.3: the countdown below needs the room, and the banner
    // still lands well under the XP bar.
    bannerY: height * 0.27,
    countdownY: height * 0.4,
    pauseX: width - SIDE * unit - pauseSize / 2,
    pauseY: heartsY,
    pauseSize,
    scoreX: SIDE * unit,
    scoreY: heartsY + 32 * unit,
    chamberRight: width - SIDE * unit,
    chamberY: heartsY + 32 * unit,
    pipSize: 11 * unit,
    pipGap: 6 * unit,
    xpY: heartsY + 62 * unit,
    xpHeight: 11 * unit,
    xpInset: SIDE * unit,
    levelY: heartsY + 62 * unit,
  };
};

/**
 * The level-up cards stack vertically rather than side by side: on a 360 pt
 * screen three columns cannot hold a name and an effect line legibly.
 */
export const computeOverlayLayout = (width: number, height: number): OverlayLayout => {
  const unit = unitFor(width, height);
  const topPad = topPadFor(height, unit);
  const cardGap = 15 * unit;

  return {
    width,
    height,
    unit,
    topPad,
    titleY: topPad + 52 * unit,
    cardsY: topPad + 104 * unit,
    cardX: 20 * unit,
    cardW: width - 40 * unit,
    cardH: 96 * unit,
    cardGap,
  };
};

export const computeResultLayout = (width: number, height: number): ResultLayout => {
  const unit = unitFor(width, height);
  const topPad = topPadFor(height, unit);
  const titleY = topPad + height * 0.14;

  return {
    width,
    height,
    unit,
    topPad,
    titleY,
    scoreLabelY: titleY + 62 * unit,
    scoreValueY: titleY + 112 * unit,
    statsY: titleY + 170 * unit,
    retryY: height * 0.72,
    exitY: height * 0.72 + 76 * unit,
  };
};
