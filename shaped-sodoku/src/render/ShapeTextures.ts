import Phaser from 'phaser';

import { darken } from './Chunky.ts';
import { PALETTE, shapeStyle } from './palette.ts';

/**
 * Every shape in the game, drawn in code.
 *
 * There are no image files anywhere in this project: silhouettes, gloss and confetti are
 * rasterised once into generated textures, then reused as plain sprites. That keeps the
 * bundle tiny, keeps everything crisp at any density, and honours the offline rule by
 * never fetching anything.
 *
 * A shape is a solid chip, not a character: a dropped dark edge gives it thickness, an
 * inner outline keeps it crisp against both the cream cells and the indigo background,
 * and one soft ellipse of gloss says where the light is. Reactions are carried by the
 * tween on the sprite — a wobble, a pop — rather than by repainting a face.
 */

/** Side length of every generated shape texture. */
export const SHAPE_TEXTURE_SIZE = 72;
const SIZE = SHAPE_TEXTURE_SIZE;
const HALF = SIZE / 2;
/** Silhouette radius before fitting; the outline is stroked inside it, so nothing overhangs. */
const RADIUS = 30;
const OUTLINE = 5;
/** Confetti is a 4px solid square, tinted per particle. */
const CONFETTI = 4;

export function shapeTextureKey(shape: number): string {
    return `shape-${shape}`;
}

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

/**
 * The classic cardioid is written for a y-up canvas, and everything here draws
 * y-down — so the y term is negated or the tip would point at the sky.
 */
function heartPolygon(steps: number): Point[] {
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        points.push({ x, y: -y });
    }
    return points;
}

/** Walks `points` as a closed subpath of the current path. */
function tracePolygon(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
}

/**
 * The silhouette of `name` as a polygon, or `null` for the two shapes drawn from curves.
 *
 * Shared by the tracer and the thickness sweep below, so the two can never disagree about
 * where a shape's edge is. The circle and the rounded square are `null`: their downward
 * translate already meets itself cleanly, so there is no corner for a gap to open in.
 */
function silhouettePolygon(name: ReturnType<typeof shapeStyle>['name']): Point[] | null {
    const span = RADIUS * 2;

    switch (name) {
        case 'triangle':
            return fitPoints(
                [
                    { x: 0, y: -RADIUS },
                    { x: -RADIUS * 0.95, y: RADIUS * 0.78 },
                    { x: RADIUS * 0.95, y: RADIUS * 0.78 },
                ],
                HALF, HALF, span, span,
            );
        case 'star':
            return fitPoints(starPolygon(5, RADIUS, RADIUS * 0.46), HALF, HALF, span, span);
        case 'hexagon':
            // Flat-topped: the classic nut silhouette, unmistakable against the circle.
            return fitPoints(regularPolygon(6, RADIUS), HALF, HALF, span, span);
        case 'heart':
            return fitPoints(heartPolygon(72), HALF, HALF, span, span);
        default:
            return null;
    }
}

/**
 * Traces the silhouette of `shape` as the current path, centred in the texture.
 *
 * Geometry only — every painter below reuses this so the edge, the gloss and the outline
 * can never drift apart by a pixel.
 */
function traceShape(ctx: CanvasRenderingContext2D, shape: number): void {
    const { name } = shapeStyle(shape);
    const span = RADIUS * 2;

    switch (name) {
        case 'circle':
            ctx.moveTo(HALF + RADIUS, HALF);
            ctx.arc(HALF, HALF, RADIUS, 0, Math.PI * 2);
            break;
        case 'square':
            roundedRectPath(ctx, HALF - RADIUS, HALF - RADIUS, span, span, RADIUS * 0.24);
            break;
        default: {
            const polygon = silhouettePolygon(name);
            if (polygon) tracePolygon(ctx, polygon);
            break;
        }
    }
}

/**
 * Paints the outline of `shape` swept straight down by `thickness`.
 *
 * Translating the whole shape downward and stopping there leaves a notch wherever a foot
 * is not flat: a triangle's base would let the cell show through the corner where its
 * sloped side meets it, and the hexagon and heart have the same problem. Sweeping each
 * edge closes those corners exactly — the same region, described as the outline dragged
 * down rather than the shape copied down. Because a sweep only ever moves *down*, it can
 * never widen a shape sideways.
 *
 * Every band is filled in its own call. Adjacent edges of a polygon run in opposite
 * directions, so a shared path gives their windings opposite signs and they cancel
 * precisely where two bands overlap — which is the corner this exists to repair.
 */
function paintThickness(ctx: CanvasRenderingContext2D, shape: number, thickness: number, colour: string): void {
    const polygon = silhouettePolygon(shapeStyle(shape).name);
    if (!polygon) return;

    ctx.fillStyle = colour;
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.lineTo(to.x, to.y + thickness);
        ctx.lineTo(from.x, from.y + thickness);
        ctx.closePath();
        ctx.fill();
    }
}

/** A rounded rectangle drawn as a path, built by hand so no platform-specific call is needed. */
function roundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): void {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

const cssColour = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

/** How far the shaded underside hangs below the face — the shape's thickness. */
const EDGE = 5;
/** Gloss strength across the top of every shape. */
const GLOSS = 'rgba(255, 255, 255, 0.3)';

/**
 * Paints one shape body: dropped dark edge, lit face, gloss, then the outline.
 *
 * This is `drawBevel` in miniature — the same vocabulary the buttons, tray slots and panel
 * are built from — so a shape on a cell reads as a small slab of the same material as the
 * furniture around it rather than as a flat sticker.
 *
 * The outline is stroked *inside* the silhouette. Stroking it centred would push the
 * silhouette 2.5px outward and bury almost all of the dark edge; an inner stroke keeps the
 * footprint honest and leaves the full thickness visible below.
 */
function paintShape(ctx: CanvasRenderingContext2D, shape: number): void {
    const style = shapeStyle(shape);
    const edge = cssColour(darken(style.fill, 0.45));

    // The thickness: the silhouette dropped, plus its outline swept down to close the
    // corners a plain drop would leave open. Painted first, so the body below covers
    // everything that falls inside the shape and only the underside shows.
    ctx.save();
    ctx.translate(0, EDGE);
    ctx.beginPath();
    traceShape(ctx, shape);
    ctx.fillStyle = edge;
    ctx.fill();
    ctx.restore();

    paintThickness(ctx, shape, EDGE, edge);

    ctx.beginPath();
    traceShape(ctx, shape);
    ctx.fillStyle = cssColour(style.fill);
    ctx.fill();

    // Gloss: one soft, slightly tilted ellipse — a sheen, not a lid. Clipped to the body so
    // it can never spill past an edge, which is what lets a single shape serve all six.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = GLOSS;
    ctx.beginPath();
    ctx.ellipse(
        HALF - RADIUS * 0.12,
        HALF - RADIUS * 0.46,
        RADIUS * 0.46,
        RADIUS * 0.2,
        -0.3,
        0,
        Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    traceShape(ctx, shape);
    ctx.clip();
    ctx.beginPath();
    traceShape(ctx, shape);
    ctx.lineWidth = OUTLINE * 2; // only the inner half survives the clip
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cssColour(style.outline);
    ctx.stroke();
    ctx.restore();
}

/**
 * Generates every shape texture the game needs. Idempotent, so scenes can call it on
 * `create` without checking first.
 *
 * Canvas textures rather than `Graphics.generateTexture`: the gloss and the inner outline
 * both have to be clipped to the silhouette, which Graphics has no way to express.
 */
export function ensureShapeTextures(scene: Phaser.Scene): void {
    for (const shape of [0, 1, 2, 3, 4, 5]) {
        const key = shapeTextureKey(shape);
        if (scene.textures.exists(key)) continue;

        const texture = scene.textures.createCanvas(key, SIZE, SIZE);
        if (!texture) continue;

        paintShape(texture.getContext(), shape);
        texture.refresh();
    }
}

/** A face-less heart for the HUD, kept separate from the board's pink heart. */
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
