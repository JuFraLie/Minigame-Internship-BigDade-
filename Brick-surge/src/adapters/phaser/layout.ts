/**
 * Where every screen element goes — pure maths over a Viewport. No Phaser,
 * no DOM, no colours: scenes ask for a layout and then build; they never do
 * arithmetic of their own.
 *
 * All values are design units (CSS pixels of the portrait playfield) and
 * scale with the width, so any portrait phone — a small 720p or a tall 21:9,
 * notch or no notch — gets a sensible arrangement. Unit tested in
 * tests/layout.test.ts.
 */

import { hudTop, type Viewport } from './viewport.ts';

/** The Play Screen: title, how-to, Play button — top to bottom. */
export interface MenuLayout {
    titleSize: number;
    titleY: number;
    howToY: number;
    howToSize: number;
    /** Wrap width for the how-to copy — keeps it inside the screen. */
    howToWrapWidth: number;
    playY: number;
    playWidth: number;
    /** Never below the ~44pt touch target. */
    playHeight: number;
    playFontSize: number;
    /** Round sound toggle in the top-left corner, below the cutout. */
    soundButtonX: number;
    soundButtonY: number;
    /** Never below the ~44pt touch target. */
    soundButtonSize: number;
}

export function menuLayout(viewport: Viewport): MenuLayout {
    const { width: w, height: h, safeTop } = viewport;
    const titleSize = Math.round(w * 0.11);
    // The title starts below the real cutout/status-bar inset.
    const titleY = Math.max(h * 0.28, safeTop + titleSize * 1.5);
    return {
        titleSize,
        titleY,
        howToY: titleY + h * 0.1,
        howToSize: Math.round(w * 0.045),
        howToWrapWidth: Math.round(w * 0.86),
        playY: titleY + h * 0.28,
        playWidth: w * 0.5,
        playHeight: Math.max(h * 0.07, 44),
        playFontSize: Math.round(w * 0.06),
        soundButtonX: w * 0.1,
        soundButtonY: safeTop + w * 0.1,
        soundButtonSize: Math.max(w * 0.12, 44),
    };
}

/** The Result Panel: headline, run stats, Retry, Exit — top to bottom. */
export interface ResultLayout {
    headlineSize: number;
    headlineY: number;
    waveY: number;
    waveSize: number;
    scoreY: number;
    scoreSize: number;
    retryY: number;
    exitY: number;
    buttonWidth: number;
    /** Never below the ~44pt touch target. */
    buttonHeight: number;
    buttonFontSize: number;
}

export function resultLayout(viewport: Viewport): ResultLayout {
    const { width: w, height: h, safeTop } = viewport;
    const headlineSize = Math.round(w * 0.1);
    // The headline clears the cutout/status-bar inset.
    const headlineY = Math.max(h * 0.3, safeTop + w * 0.16);
    const retryY = headlineY + h * 0.22;
    return {
        headlineSize,
        headlineY,
        waveY: headlineY + h * 0.075,
        waveSize: Math.round(w * 0.05),
        scoreY: headlineY + h * 0.145,
        scoreSize: Math.round(w * 0.055),
        retryY,
        exitY: retryY + h * 0.11,
        buttonWidth: w * 0.5,
        buttonHeight: Math.max(h * 0.075, 44),
        buttonFontSize: Math.round(w * 0.05),
    };
}

/** The in-round pause controls: the round button up top, the overlay below. */
export interface PauseLayout {
    pauseButtonX: number;
    pauseButtonY: number;
    pauseButtonSize: number;
    pauseButtonFontSize: number;
    labelSize: number;
    labelY: number;
    resumeY: number;
    resumeWidth: number;
    /** Never below the ~44pt touch target. */
    resumeHeight: number;
    resumeFontSize: number;
    /** Round sound toggle, centred below the resume button. */
    soundButtonX: number;
    soundButtonY: number;
    /** Never below the ~44pt touch target. */
    soundButtonSize: number;
}

export function pauseLayout(viewport: Viewport): PauseLayout {
    const { width: w, height: h } = viewport;
    const resumeY = h * 0.55;
    const resumeHeight = Math.max(h * 0.07, 44);
    const soundButtonSize = Math.max(w * 0.15, 44);
    return {
        // Just under the HUD band, clear of any cutout.
        pauseButtonX: w * 0.92,
        pauseButtonY: hudTop(viewport, Math.round(w * 0.045)) + w * 0.055,
        pauseButtonSize: w * 0.09,
        pauseButtonFontSize: Math.round(w * 0.04),
        labelSize: Math.round(w * 0.09),
        labelY: h * 0.4,
        resumeY,
        resumeWidth: w * 0.5,
        resumeHeight,
        resumeFontSize: Math.round(w * 0.05),
        soundButtonX: w * 0.5,
        soundButtonY: resumeY + resumeHeight / 2 + w * 0.06 + soundButtonSize / 2,
        soundButtonSize,
    };
}

/** The in-round HUD: font sizes, the tinted band, and every text position. */
export interface HudLayout {
    fontSize: number;
    bigSize: number;
    comboSize: number;
    /** Safe-area-aware band height — the HUD never hides behind a notch. */
    bandHeight: number;
    rowY: number;
    scoreX: number;
    waveX: number;
    ballsX: number;
    comboY: number;
    bannerY: number;
    serveY: number;
}

export function hudLayout(viewport: Viewport): HudLayout {
    const fontSize = Math.round(viewport.width * 0.045);
    const bandHeight = hudTop(viewport, fontSize);
    return {
        fontSize,
        bigSize: Math.round(viewport.width * 0.09),
        comboSize: Math.round(viewport.width * 0.05),
        bandHeight,
        rowY: bandHeight * 0.5,
        scoreX: viewport.width * 0.04,
        waveX: viewport.width * 0.5,
        ballsX: viewport.width * 0.96,
        comboY: bandHeight + viewport.width * 0.06,
        bannerY: viewport.height * 0.4,
        serveY: viewport.height * 0.6,
    };
}
