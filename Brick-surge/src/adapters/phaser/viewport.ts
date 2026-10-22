/**
 * Device measurement for mobile: viewport size in design units, the render
 * (backing-store) density, and the real cutout/status-bar inset read through
 * the invisible probe declared in index.html.
 *
 * Design units are plain CSS pixels of the window, so the canvas backing store
 * is `renderScale()` times larger — that is what keeps the game sharp on a
 * high-density phone instead of a soft blur. Kept out of the domain: none of
 * this is game logic.
 */

import type Phaser from 'phaser';

/** Top of the screen the HUD must stay clear of (AGENTS.md §3.1). */
export const HUD_TOP_FRAC = 0.08;

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
    /** Window width in design units (CSS pixels). */
    width: number;
    /** Window height in design units — any vertical height is supported. */
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
 * The current window in design units. Read fresh on every call so a WebView
 * that settles late (or a browser URL bar collapsing) never leaves the layout
 * describing a size the canvas has left behind.
 */
export function measureViewport(): Viewport {
    return {
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
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
 * actually reports a bigger cutout/status-bar inset, so the score and lives
 * are never hidden behind a notch.
 */
export function hudTop(viewport: Viewport, fontSize: number): number {
    return Math.max(viewport.height * HUD_TOP_FRAC, viewport.safeTop + fontSize * 1.6);
}
