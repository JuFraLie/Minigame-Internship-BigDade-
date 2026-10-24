/**
 * Device measurement for mobile: the portrait playfield in design units, the
 * render (backing-store) density, and the real cutout/status-bar inset read
 * through the invisible probe declared in index.html.
 *
 * The playfield is portrait-locked (see `portraitPlayfield`): the game always
 * plays in a portrait-shaped column, whatever the device is doing. In landscape
 * the column is centred in the window and the page background fills the sides,
 * so the layout never squashes into a short wide strip — and the game is never
 * blocked, it just stays portrait.
 *
 * Design units are plain CSS pixels of the playfield, so the canvas backing
 * store is `renderScale()` times larger — that is what keeps the game sharp on
 * a high-density phone instead of a soft blur. Kept out of the domain: none of
 * this is game logic.
 */

import type Phaser from 'phaser';

/** Top of the screen the HUD must stay clear of (AGENTS.md §3.1). */
export const HUD_TOP_FRAC = 0.08;

/**
 * The widest playfield the game lays out, as width / height. Anything squarer
 * than this — a landscape phone, a tablet held sideways, a desktop window —
 * gets clamped to a portrait column of the same height.
 *
 * 3:5 (0.6) is chosen just above the widest real portrait phone (a 320×568
 * iPhone SE is 0.563; most are ~0.46), so an upright phone is never touched:
 * it gets the full window exactly as before. The clamp only ever engages on
 * non-portrait windows, and even then the result is unmistakably portrait.
 */
export const PORTRAIT_MAX_ASPECT = 3 / 5;

/**
 * Clamp a window size to the portrait playfield (pure — unit tested).
 *
 * Portrait sizes come back untouched; wider-than-portrait ones come back as a
 * centred portrait column at the same height, floored to whole CSS pixels so
 * the aspect never exceeds the cap and the canvas backing store stays
 * integral. Width/height are floored at 1.
 */
export function portraitPlayfield(width: number, height: number): { width: number; height: number } {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const capped = Math.max(1, Math.floor(h * PORTRAIT_MAX_ASPECT));
    return w <= capped
        ? { width: w, height: h }
        : { width: capped, height: h };
}

/**
 * Backing-store density, capped at 2: past that a G95-class GPU only loses
 * frames. Sampled once at launch and kept for the session (no storage) —
 * re-reading it later would aim the camera at a canvas built for a different
 * density.
 */
let density: number | null = null;

export function renderScale(): number {
    if (density === null) {
        density = Math.min(window.devicePixelRatio || 1, 2);
    }
    return density;
}

export interface Viewport {
    /** Playfield width in design units (CSS pixels), portrait-locked. */
    width: number;
    /** Playfield height in design units — any vertical height is supported. */
    height: number;
    /** Device cutout / status-bar inset at the top, in design units. */
    safeTop: number;
}

/** Reads env(safe-area-inset-top) through the invisible probe in index.html. */
function readCutoutInset(): number {
    if (typeof document === 'undefined') return 0;
    const probe = document.getElementById('safe-area-probe');
    if (!probe) return 0;
    const padding = Number.parseFloat(window.getComputedStyle(probe).paddingTop);
    return Number.isFinite(padding) ? padding : 0;
}

/**
 * The current playfield in design units: the window clamped to portrait
 * (see `portraitPlayfield`). Read fresh on every call so a WebView that
 * settles late (or a browser URL bar collapsing) never leaves the layout
 * describing a size the canvas has left behind.
 *
 * Everything — canvas size, scene layout, world aspect — is derived from this,
 * so a device rotated mid-game simply re-lays out on the next VIEWPORT_CHANGED.
 */
export function measureViewport(): Viewport {
    const playfield = portraitPlayfield(window.innerWidth, window.innerHeight);
    return {
        width: playfield.width,
        height: playfield.height,
        safeTop: readCutoutInset(),
    };
}

/**
 * Event emitted on `game.events` once the canvas has adopted a new size.
 * Screens re-lay themselves out when they hear it.
 */
export const VIEWPORT_CHANGED = 'viewportChanged';

/**
 * The backing store is `renderScale()` times the design size, so every scene
 * zooms its camera by the same factor: layout stays in design units while the
 * canvas stays sharp.
 *
 * `setOrigin(0, 0)` is not cosmetic: Camera.preRender builds its matrix as
 * `origin + zoom * (point - origin)`, so with the default 0.5 origin the point
 * 0 would land off-canvas once zoomed. Anchoring top-left reduces the mapping
 * to `zoom * point`, exactly the design-space layout this game uses.
 */
export function applyRenderScale(scene: Phaser.Scene): void {
    const camera = scene.cameras.main;
    camera.setOrigin(0, 0);
    camera.setZoom(renderScale());
}

/**
 * The HUD band: the design-doc's 8% of height, widened when the device
 * actually reports a bigger cutout/status-bar inset, so the score and ball count
 * are never hidden behind a notch.
 */
export function hudTop(viewport: Viewport, fontSize: number): number {
    return Math.max(viewport.height * HUD_TOP_FRAC, viewport.safeTop + fontSize * 1.6);
}
