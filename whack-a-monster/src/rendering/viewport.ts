import type Phaser from 'phaser';
import {
    DESIGN_HEIGHT,
    MAX_DESIGN_ASPECT,
    MIN_DESIGN_ASPECT,
} from './layout.ts';
import type { Viewport } from './layout.ts';

/**
 * Everything that reads the device: viewport measurement, the cutout probe and the pixel
 * density factor. Kept apart from `layout.ts` so the layout maths stays pure.
 */

/**
 * Backing-store density, capped at 2: past that the G95-class GPU only loses frames.
 *
 * It is sampled once, at launch, and kept for the whole session: the canvas backing store is
 * `renderScale()` times the design size, so re-reading it later (browser zoom, a DevTools
 * device emulation) would aim the camera at a canvas built for a different density and draw
 * the world at the wrong size.
 *
 * The value lives in memory for the launch only — no storage of any kind is involved.
 */
let density: number | null = null;

export function renderScale(): number {
    if (density === null) {
        density = Math.min(window.devicePixelRatio || 1, 2);
    }
    return density;
}

/**
 * Design size for the current window: always `DESIGN_HEIGHT` tall, and wide enough to match
 * the device aspect ratio inside a portrait range. No fixed 9:16 or 3:4 is assumed — any
 * vertical screen height maps onto this space and the canvas fills it edge to edge.
 *
 * Read fresh on every call. `StartGame` keeps the canvas in step with it and announces the
 * change with `VIEWPORT_CHANGED`, so every screen lays itself out against exactly the size
 * the canvas is drawing — never against a size the canvas has left behind.
 */
export function designSize(): { width: number; height: number } {
    const aspect = Math.min(
        Math.max(window.innerWidth / Math.max(1, window.innerHeight), MIN_DESIGN_ASPECT),
        MAX_DESIGN_ASPECT,
    );
    return { width: Math.round(DESIGN_HEIGHT * aspect), height: DESIGN_HEIGHT };
}

/**
 * Event name `StartGame` emits on `game.events` once the canvas has adopted a new design
 * size. Screens rebuild their layout when they hear it, which is what keeps a window resize
 * (split screen, a WebView that settles late, DevTools) from pushing the HUD off-screen.
 */
export const VIEWPORT_CHANGED = 'viewportChanged';

/** Screen units per CSS pixel: `DESIGN_HEIGHT` always spans the whole window height. */
function screenUnitsPerCssPixel(): number {
    return DESIGN_HEIGHT / Math.max(1, window.innerHeight);
}

/** Reads `env(safe-area-inset-top)` through the invisible probe declared in index.html. */
function readCutoutInset(): number {
    if (typeof document === 'undefined') return 0;
    const probe = document.getElementById('safe-area-probe');
    if (!probe) return 0;

    const padding = Number.parseFloat(window.getComputedStyle(probe).paddingTop);
    return Number.isFinite(padding) ? padding : 0;
}

export function measureViewport(): Viewport {
    const size = designSize();
    return {
        width: size.width,
        height: size.height,
        safeTop: readCutoutInset() * screenUnitsPerCssPixel(),
    };
}

/**
 * The backing store is `renderScale()` times the design size, so every scene zooms its
 * camera by the same factor: world coordinates stay in design units while the canvas stays
 * sharp on a high-density phone.
 *
 * `setOrigin(0, 0)` is not cosmetic: `Camera.preRender` builds its matrix as
 * `origin + zoom * (point - origin)`, so with the default 0.5 origin the world point 0
 * would land far off-canvas once zoomed. Anchoring the origin top-left reduces the mapping
 * to `zoom * point`, which is exactly the design-space layout this game uses.
 */
export function applyRenderScale(scene: Phaser.Scene): void {
    const camera = scene.cameras.main;
    camera.setOrigin(0, 0);
    camera.setZoom(renderScale());
}
