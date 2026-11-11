import type { ViewportPort } from './ports.ts';

/**
 * Measuring the device, and turning that into a design-space viewport.
 *
 * The rules require portrait, edge-to-edge rendering that works at any vertical height
 * and clears status bars and cutouts. So the design size is derived from the live
 * viewport rather than a fixed 9:16, and the cutout insets are read from the invisible
 * CSS probe in `index.html` — the only honest way to learn `env(safe-area-inset-*)` from
 * JS. Exposed as a `ViewportPort`, so nothing outside `src/app/` ever touches `window`.
 */

/** Widest portrait aspect (width/height) we lay out for; landscape is not optimised. */
const MAX_ASPECT = 9 / 16;
/** Narrowest before the board would stop being usable. */
const MIN_ASPECT = 0.4;
/** Backing-store multiplier; capped so a 3x phone does not triple-fill every frame. */
const MAX_RENDER_SCALE = 2;

/** Emitted on the Phaser game when the viewport changed (resize, orientation). */
export const VIEWPORT_CHANGED = 'viewportChanged';

export interface DesignSize {
    readonly width: number;
    readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** Reads the invisible probe's padding, i.e. the device's cutout inset in CSS pixels. */
function readProbePadding(side: 'Top' | 'Bottom'): number {
    if (typeof document === 'undefined') return 0;
    const probe = document.getElementById('safe-area-probe');
    if (!probe) return 0;
    const padding = Number.parseFloat(window.getComputedStyle(probe)[`padding${side}`]);
    return Number.isFinite(padding) ? padding : 0;
}

/**
 * Screen units per CSS pixel.
 *
 * The design height tracks the window height, so this is normally exactly 1 and an inset
 * measured in CSS pixels is already a design-space length. It is computed rather than
 * hard-coded so the conversion keeps its meaning if the design size ever stops tracking
 * the window. It is emphatically *not* `renderScale()` — that is the backing-store
 * density, which the camera zoom already accounts for.
 */
function screenUnitsPerCssPixel(): number {
    if (typeof window === 'undefined' || !window.innerHeight) return 1;
    return designSize().height / window.innerHeight;
}

/** Design-space size, keeping a portrait aspect anywhere between the min and max. */
export function designSize(): DesignSize {
    if (typeof window === 'undefined') return { width: 390, height: 760 };
    const height = Math.max(320, window.innerHeight);
    const aspect = clamp(window.innerWidth / height, MIN_ASPECT, MAX_ASPECT);
    return { width: Math.round(height * aspect), height };
}

/** Backing-store scale: `min(devicePixelRatio, 2)`. */
export function renderScale(): number {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
}

/** The viewport as seen through the game's port. Re-read on every call, so resize is free. */
export function createViewport(): ViewportPort {
    return {
        current() {
            const size = designSize();
            const units = screenUnitsPerCssPixel();
            return {
                width: size.width,
                height: size.height,
                safeTop: readProbePadding('Top') * units,
                safeBottom: readProbePadding('Bottom') * units,
            };
        },
    };
}
