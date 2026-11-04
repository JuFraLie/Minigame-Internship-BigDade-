import Phaser from 'phaser';

import { PALETTE, shapeStyle } from './palette.ts';

/**
 * Every shape in the game, drawn in code.
 *
 * There are no image files anywhere in this project: silhouettes, faces and confetti are
 * rasterised once through Phaser's Graphics into generated textures, then reused as
 * plain sprites. That keeps the bundle tiny, keeps everything crisp at any density, and
 * honours the offline rule by never fetching anything.
 *
 * Each shape is baked in three moods so a placement can react without redrawing:
 * `normal` (two dot eyes and a small smile), `blink` (eyes closed, for the correct-placement
 * flourish) and `surprised` (wide eyes and an O mouth, for a wrong one).
 */

export type ShapeMood = 'normal' | 'blink' | 'surprised';

export type MoodKey = `shape-${number}-${ShapeMood}`;

/** Side length of every generated shape texture. */
export const SHAPE_TEXTURE_SIZE = 72;
const SIZE = SHAPE_TEXTURE_SIZE;
const HALF = SIZE / 2;
/** Silhouette radius before fitting; leaves room for the outline stroke. */
const RADIUS = 30;
const OUTLINE = 5;
/** Confetti is a 4px solid square, tinted per particle. */
const CONFETTI = 4;

const MOODS: readonly ShapeMood[] = ['normal', 'blink', 'surprised'];

export function shapeTextureKey(shape: number, mood: ShapeMood): MoodKey {
    return `shape-${shape}-${mood}`;
}

/** Per-shape face placement: the silhouette's visual centre is not always its geometric one. */
interface FaceLayout {
    /** Vertical offset of the face from the centre of the texture. */
    readonly dy: number;
    /** Horizontal distance between the two eyes. */
    readonly eyeSpacing: number;
    readonly eyeRadius: number;
    readonly mouthWidth: number;
}

const FACE_LAYOUTS: Record<string, FaceLayout> = {
    circle: { dy: 0, eyeSpacing: 11, eyeRadius: 4.2, mouthWidth: 12 },
    square: { dy: 0, eyeSpacing: 11, eyeRadius: 4.2, mouthWidth: 12 },
    // A triangle's mass sits low, so its face drops to stay inside the silhouette.
    triangle: { dy: 9, eyeSpacing: 9, eyeRadius: 3.8, mouthWidth: 10 },
    // The star's inner radius is tight, so the whole face shrinks to fit.
    star: { dy: 0, eyeSpacing: 9, eyeRadius: 3.6, mouthWidth: 9 },
    hexagon: { dy: 0, eyeSpacing: 11, eyeRadius: 4.2, mouthWidth: 12 },
    // The heart's lobes leave its usable centre a little below the middle.
    heart: { dy: 4, eyeSpacing: 10, eyeRadius: 4, mouthWidth: 11 },
};

type Point = { x: number; y: number };

/** Scales and centres an arbitrary sampled path to fit a box, so every shape reads the same size. */
function fitPoints(points: readonly Point[], cx: number, cy: number, maxW: number, maxH: number): Point[] {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }

    const width = Math.max(1e-6, maxX - minX);
    const height = Math.max(1e-6, maxY - minY);
    const scale = Math.min(maxW / width, maxH / height);
    const offsetX = cx - (minX + width / 2) * scale;
    const offsetY = cy - (minY + height / 2) * scale;

    return points.map((point) => ({ x: point.x * scale + offsetX, y: point.y * scale + offsetY }));
}

function regularPolygon(sides: number, radius: number, startAngle = 0): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < sides; i++) {
        const angle = startAngle + (i * Math.PI * 2) / sides;
        points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return points;
}

function starPolygon(spikes: number, outer: number, inner: number): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
        points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return points;
}

function heartPolygon(steps: number): Point[] {
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        points.push({ x, y });
    }
    return points;
}

/** Paints the silhouette of `shape` centred in the texture, outline included. */
function drawSilhouette(graphics: Phaser.GameObjects.Graphics, shape: number): void {
    const style = shapeStyle(shape);
    graphics.fillStyle(style.fill, 1);
    graphics.lineStyle(OUTLINE, style.outline, 1);

    const span = RADIUS * 2;

    const polygon = (points: Point[]): void => {
        graphics.fillPoints(points, true);
        graphics.strokePoints(points, true, true);
    };

    switch (style.name) {
        case 'circle':
            graphics.fillCircle(HALF, HALF, RADIUS);
            graphics.strokeCircle(HALF, HALF, RADIUS);
            break;
        case 'square': {
            const corner = RADIUS * 0.24;
            graphics.fillRoundedRect(HALF - RADIUS, HALF - RADIUS, span, span, corner);
            graphics.strokeRoundedRect(HALF - RADIUS, HALF - RADIUS, span, span, corner);
            break;
        }
        case 'triangle': {
            const raw: Point[] = [
                { x: 0, y: -RADIUS },
                { x: -RADIUS * 0.95, y: RADIUS * 0.78 },
                { x: RADIUS * 0.95, y: RADIUS * 0.78 },
            ];
            polygon(fitPoints(raw, HALF, HALF, span, span));
            break;
        }
        case 'star':
            polygon(fitPoints(starPolygon(5, RADIUS, RADIUS * 0.46), HALF, HALF, span, span));
            break;
        case 'hexagon':
            // Flat-topped: the classic nut silhouette, unmistakable against the circle.
            polygon(fitPoints(regularPolygon(6, RADIUS), HALF, HALF, span, span));
            break;
        case 'heart':
            polygon(fitPoints(heartPolygon(72), HALF, HALF, span, span));
            break;
    }
}

/** Paints the face for `mood` on top of an already-drawn silhouette. */
function drawFace(graphics: Phaser.GameObjects.Graphics, shape: number, mood: ShapeMood): void {
    const style = shapeStyle(shape);
    const face = FACE_LAYOUTS[style.name];
    const ink = style.outline;

    const eyeY = HALF + face.dy - 4;
    const leftX = HALF - face.eyeSpacing;
    const rightX = HALF + face.eyeSpacing;
    const mouthY = HALF + face.dy + 8;

    if (mood === 'blink') {
        // Two short strokes read as closed eyes at any size the shape is drawn at.
        graphics.lineStyle(Math.max(2.5, face.eyeRadius * 0.8), ink, 1);
        graphics.lineBetween(leftX - face.eyeRadius, eyeY, leftX + face.eyeRadius, eyeY);
        graphics.lineBetween(rightX - face.eyeRadius, eyeY, rightX + face.eyeRadius, eyeY);
    } else {
        const eyeRadius = mood === 'surprised' ? face.eyeRadius * 1.4 : face.eyeRadius;
        graphics.fillStyle(ink, 1);
        graphics.fillCircle(leftX, eyeY, eyeRadius);
        graphics.fillCircle(rightX, eyeY, eyeRadius);
    }

    graphics.lineStyle(Math.max(2.5, face.eyeRadius * 0.75), ink, 1);

    if (mood === 'surprised') {
        graphics.strokeCircle(HALF, mouthY, face.mouthWidth * 0.3);
        return;
    }

    // A shallow downward arc: a small, friendly smile.
    graphics.beginPath();
    graphics.arc(HALF, mouthY - face.mouthWidth * 0.18, face.mouthWidth * 0.5, Math.PI * 0.15, Math.PI * 0.85, false);
    graphics.strokePath();
}

/**
 * Generates every shape texture the game needs. Idempotent, so scenes can call it on
 * `create` without checking first.
 */
export function ensureShapeTextures(scene: Phaser.Scene): void {
    for (const shape of [0, 1, 2, 3, 4, 5]) {
        for (const mood of MOODS) {
            const key = shapeTextureKey(shape, mood);
            if (scene.textures.exists(key)) continue;

            const graphics = scene.add.graphics();
            drawSilhouette(graphics, shape);
            drawFace(graphics, shape, mood);
            graphics.generateTexture(key, SIZE, SIZE);
            graphics.destroy();
        }
    }
}

/** A face-less heart for the HUD, where a tiny grin would only read as noise. */
export const HEART_KEY = 'hud-heart';
/** The same heart, in the colour it goes once it has been spent. */
export const HEART_SPENT_KEY = 'hud-heart-spent';

/**
 * Both heart states, baked as separate textures.
 *
 * Phaser's Canvas renderer draws a sprite with a plain `ctx.drawImage` and never reads
 * `tintTopLeft` / `tintFill` — tinting is a WebGL-only path in Phaser 3. This project is
 * Canvas-only by contract, so `setTint()` would silently do nothing: every heart would
 * stay white and a spent heart would be indistinguishable from a full one, making the
 * lose condition invisible. The colours are baked in here instead and the renderer swaps
 * textures, which the Canvas path does honour.
 */
export function ensureHeartTextures(scene: Phaser.Scene): void {
    for (const [key, colour] of [
        [HEART_KEY, PALETTE.heart],
        [HEART_SPENT_KEY, PALETTE.heartSpent],
    ] as const) {
        if (scene.textures.exists(key)) continue;

        const graphics = scene.add.graphics();
        graphics.fillStyle(colour, 1);
        graphics.lineStyle(4, colour, 1);
        const points = fitPoints(heartPolygon(72), HALF, HALF, RADIUS * 2, RADIUS * 2);
        graphics.fillPoints(points, true);
        graphics.strokePoints(points, true, true);
        graphics.generateTexture(key, SIZE, SIZE);
        graphics.destroy();
    }
}

/** One colour per confetti flake, baked for the same reason as the hearts above. */
export const CONFETTI_COLOURS: readonly number[] = [
    PALETTE.cell,
    PALETTE.highlight,
    PALETTE.button,
    PALETTE.buttonAlt,
    PALETTE.heart,
    0xffffff,
];

/** Key of the baked confetti square for a colour index. */
export function confettiTextureKey(index: number): string {
    return `confetti-${index % CONFETTI_COLOURS.length}`;
}

/** The 4px solid squares the confetti bursts are built from, one texture per colour. */
export function ensureConfettiTextures(scene: Phaser.Scene): void {
    CONFETTI_COLOURS.forEach((colour, index) => {
        const key = confettiTextureKey(index);
        if (scene.textures.exists(key)) return;

        const graphics = scene.add.graphics();
        graphics.fillStyle(colour, 1);
        graphics.fillRect(0, 0, CONFETTI, CONFETTI);
        graphics.generateTexture(key, CONFETTI, CONFETTI);
        graphics.destroy();
    });
}

/**
 * The deep navy-to-indigo background wash.
 *
 * Phaser Graphics has no gradient, so this is the one place a raw canvas context is used â€”
 * an 8Ã—256 texture that the renderer stretches to the viewport. Still generated in code,
 * still bundled, still nothing fetched.
 */
export function ensureBackgroundTexture(scene: Phaser.Scene): void {
    const key = 'background-wash';
    if (scene.textures.exists(key)) return;

    const texture = scene.textures.createCanvas(key, 8, 256);
    if (!texture) return;

    const context = texture.getContext();
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#1b2450');
    gradient.addColorStop(0.55, '#2b2f63');
    gradient.addColorStop(1, '#3d3272');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 8, 256);
    texture.refresh();
}

/** Builds every texture the game uses. Idempotent â€” callers need not check first. */
export function ensureTextures(scene: Phaser.Scene): void {
    ensureShapeTextures(scene);
    ensureHeartTextures(scene);
    ensureConfettiTextures(scene);
    ensureBackgroundTexture(scene);
}
