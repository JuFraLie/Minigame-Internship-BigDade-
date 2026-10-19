import Phaser from 'phaser';
import { BUS_COLOR, BUS_LENGTH, CAR_COLORS } from '../core/config.ts';

/**
 * Vehicle art: the bundled racing pack, loaded once and baked to board scale.
 *
 * Nothing is downloaded and nothing is redrawn per frame (AGENTS.md §3.4): the pack ships
 * every vehicle pointing NORTH with the nose at the top and the tyres overhanging the
 * sides, and each image is turned a quarter turn into a canvas texture once, at launch
 * from `MainMenu.preload()`, and never touched again. The images themselves are local
 * files in `public/assets/`, so "nothing is downloaded" still holds — the loader fetches
 * them relative to the bundle, and only ever from there.
 *
 * The quarter turn matters. Every rotation in the views assumes a texture whose nose is at
 * the RIGHT edge, because that was the orientation the original procedural art used — 0
 * radians means "facing right". Turning the pack's art here keeps that contract unchanged,
 * instead of fudging a `-90°` into two different views where it would eventually be
 * forgotten.
 *
 * Each vehicle is baked at a fixed reference size — `length` cells by one cell — and the
 * views scale by `cell / REFERENCE_CELL`. A resize therefore only changes a scale factor
 * rather than forcing every texture to be rebuilt.
 *
 * Anything the pack cannot cover falls back to the procedural texture at the bottom of this
 * file, so an unmapped colour still draws a car rather than nothing at all.
 */

/**
 * Reference cell size every vehicle texture is baked at. The view scales it to fit, so this
 * number never changes how big a vehicle is on screen — only how many texels it is drawn
 * from, and therefore how sharp it can possibly be.
 *
 * It has to be large enough that the bake is not the thing throwing detail away. The pack's
 * bodies are 71px across, and the bake fits them to `0.88` of a cell, so a reference cell of
 * 80 puts the art on the canvas at 70.4px — one texel per source pixel. Below that the art
 * is squashed first and blown back up afterwards, and no amount of filtering recovers what
 * the squashing merged: at 32 the whole car was 57x28 texels, which is why it read as mush.
 *
 * It cannot be so large that a texel is *smaller* than the device pixel it lands on either,
 * because then nearest-neighbour has to throw texels away and the bodywork shimmers. The
 * smallest cell the layout ever produces is a 6x7 lot on a dpr-2 phone, at 121 device
 * pixels, which still magnifies an 80-unit texel by 1.5x.
 */
export const REFERENCE_CELL = 80;

/**
 * Marks a texture for nearest-neighbour sampling, so its pixels stay hard-edged.
 *
 * The Canvas renderer decides smoothing per texture rather than globally: every textured
 * draw sets `imageSmoothingEnabled` from `!frame.source.scaleMode`, which overwrites
 * whatever the renderer's `antialias` flag said. The only way to keep a texture crisp,
 * then, is to set the mode on the texture itself.
 *
 * Must be applied once per texture, after the texture exists and never again — it sets
 * the mode on every source, and re-applying on a frame that is mid-blit would flip the
 * smoothing under it.
 */
export function useNearest(texture: Phaser.Textures.Texture): void {
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** How much of its cells a vehicle fills along its length, leaving a gap to its neighbours. */
const FILL_ALONG = 0.9;

/** Widest a vehicle may be, as a fraction of a cell, before its tyres eat the bay lines. */
const FILL_ACROSS_MAX = 0.88;

/**
 * Length 1 is a motorcycle; every longer vehicle is drawn from the pack's full-size bodies.
 *
 * The pack also ships a compact family (`car_<colour>_small_<n>`) which is NOT used: it is
 * the same vehicle silhouette at half the pixel dimensions (40x70 against 71x131), so a car
 * built from it is the same size on the board but drawn from a smaller, softer source. The
 * bake clamps every length-2-and-up vehicle to one footprint either way, so the only thing
 * the compact family buys is less detail.
 */
const MOTORCYCLE_MAX_LENGTH = 1;
const SHORT_CAR_MAX_LENGTH = 2;

/** The pack's five body shapes. Every one is loaded; not every one suits every length. */
const SHAPE_COUNT = 5;

/** Every body the pack ships, for the vehicles that are barely stretched at all. */
const ALL_SHAPES = [1, 2, 3, 4, 5];

/**
 * The bodies that still read as vehicles once they have been lengthened.
 *
 * A three-cell car has to be stretched about 1.6× and a five-cell bus about 2.8×, because
 * the pack ships no long vehicle and a stretched car still reads where a squashed one would
 * not. Which shapes survive that is not uniform: body 2 is the shortest of the pack, so it
 * takes the worst stretch of the five, and its single small window smears into an
 * unreadable slash across an otherwise featureless slab. The pickup's flat bed becomes a
 * muddy expanse for the same reason. Bodies 1, 3 and 5 all carry cabin structure from nose
 * to tail, and hold up at both lengths.
 */
const LONG_VEHICLE_SHAPES = [1, 3, 5];

/** The van body, which is what the bus is stretched out of. */
const VAN_SHAPE = 3;

/**
 * The pack's colour names, in the same order as `CAR_COLORS`.
 *
 * The two are zipped by position rather than repeated as hex literals: a colour added to
 * the palette without a name here would silently drop to the procedural fallback.
 */
const ASSET_COLOR_NAMES = ['red', 'blue', 'yellow', 'green', 'black'];

const ASSET_COLORS = new Map<number, string>(
    CAR_COLORS.map((hex, index): [number, string] => [hex, ASSET_COLOR_NAMES[index]]),
);
// The bus is painted in its own slate, which the pack does not ship. The black body is the
// closest match once it has been stretched out to five cells.
ASSET_COLORS.set(BUS_COLOR, 'black');

const cache = new Map<string, Phaser.Textures.CanvasTexture>();

/**
 * Texture key for a vehicle of `length` cells in `color`, drawn from body `seed`.
 *
 * The seed is the car's id, so two cars of the same colour and length can still look
 * different — on a full board most of them share a colour, and colour is otherwise the
 * only thing telling them apart.
 */
export function carTextureKey(color: number, length: number, seed = 0): string {
    return `car-${color.toString(16)}-${length}-${bodyShape(color, length, seed)}`;
}

/**
 * Queues the pack's images with the loader.
 *
 * Called from the Play Screen's `preload`, which runs once at launch before any screen
 * draws a vehicle. The texture manager is shared by every scene, so one load covers the
 * whole session.
 */
export function loadVehicleArt(scene: Phaser.Scene): void {
    for (const name of ASSET_COLOR_NAMES) {
        scene.load.image(`veh-${name}-moto`, `assets/Motorcycles/motorcycle_${name}.png`);
        for (let shape = 1; shape <= SHAPE_COUNT; shape++) {
            scene.load.image(`veh-${name}-full-${shape}`, `assets/Cars/car_${name}_${shape}.png`);
        }
    }
}

/**
 * Returns the key of a ready-to-use vehicle texture, baking it on first request.
 *
 * @param seed A stable per-car value (its id) that picks the body shape. Must not change
 * between frames, or the sprite would be torn down and rebuilt on every tick.
 */
export function ensureCarTexture(
    scene: Phaser.Scene,
    color: number,
    length: number,
    seed = 0,
): string {
    const shape = bodyShape(color, length, seed);
    const key = `car-${color.toString(16)}-${length}-${shape}`;
    if (cache.has(key) && scene.textures.exists(key)) return key;

    const source = assetSource(color, length, shape);
    if (source && scene.textures.exists(source)) {
        return bakePackTexture(scene, key, source, length);
    }

    return bakeProceduralTexture(scene, key, color, length);
}

/** Drops every cached texture. Only needed if a scene is torn down for good. */
export function clearCarTextures(scene: Phaser.Scene): void {
    for (const key of cache.keys()) {
        if (scene.textures.exists(key)) scene.textures.remove(key);
    }
    cache.clear();
}

/**
 * Which of the pack's bodies a vehicle gets.
 *
 * Driven by a stable per-car seed so the fleet has variety without any of it changing
 * mid-round. The bus is pinned to the van: it is the only body that still reads as one
 * vehicle rather than a stretched smear once it is out to five cells.
 */
function bodyShape(color: number, length: number, seed: number): number {
    if (color === BUS_COLOR || length >= BUS_LENGTH) return VAN_SHAPE;

    const shapes = length > SHORT_CAR_MAX_LENGTH ? LONG_VEHICLE_SHAPES : ALL_SHAPES;
    return shapes[(Math.imul(seed, 31) + length * 7 + (color & 0xff)) % shapes.length];
}

/**
 * The key the art was loaded under, or null when the pack covers nothing this vehicle can
 * be drawn from — an unmapped colour, for instance.
 */
function assetSource(color: number, length: number, shape: number): string | null {
    const name = ASSET_COLORS.get(color);
    if (!name) return null;

    if (length <= MOTORCYCLE_MAX_LENGTH) return `veh-${name}-moto`;
    return `veh-${name}-full-${shape}`;
}

/**
 * Bakes a loaded image into a cell-shaped canvas texture: a quarter turn, then a stretch
 * to the cells the vehicle occupies.
 *
 * Along its length a vehicle fills its cells, so the board stays readable as "this car is
 * three cells long". Across, it keeps the proportion the pack drew it at unless that would
 * be wider than a cell: a motorcycle therefore stays the narrow thing it is, while a
 * three-cell car has to be stretched into a limousine, because the pack has no long
 * vehicle and a stretched car still reads where a squashed one would not.
 */
function bakePackTexture(
    scene: Phaser.Scene,
    key: string,
    sourceKey: string,
    length: number,
): string {
    const image = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
    const sourceWidth = image.width;
    const sourceHeight = image.height;

    const width = length * REFERENCE_CELL;
    const height = REFERENCE_CELL;

    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) return key;

    const ctx = texture.getContext();
    const along = width * FILL_ALONG;
    const across = Math.min(along * (sourceWidth / sourceHeight), height * FILL_ACROSS_MAX);

    // Turn the north-facing pack image a quarter clockwise so the nose sits at the right
    // edge — the orientation every rotation in the views assumes. The turn puts the image's
    // own width across the lane and its own length along the cells, which is exactly what
    // the destination rect asks for: `across` by `along`, centred on the origin the
    // translate leaves us at.
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, -across / 2, -along / 2, across, along);
    ctx.restore();

    texture.refresh();
    useNearest(texture);
    cache.set(key, texture);
    return key;
}

/**
 * The fallback: a flat rounded body with a darker cabin and pale windows, painted straight
 * into a canvas at the same reference size the pack art is baked to.
 *
 * It exists so an unmapped colour — a test's, or one added to the palette without a
 * matching art name — still draws something coherent rather than a missing texture. The
 * shipped game never reaches it.
 */
/** Texels per one of the procedural fallback's hand-drawn units. */
const PROCEDURAL_UNIT = REFERENCE_CELL / 32;

function bakeProceduralTexture(
    scene: Phaser.Scene,
    key: string,
    color: number,
    length: number,
): string {
    const width = length * REFERENCE_CELL;
    const height = REFERENCE_CELL;
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) return key;

    const ctx = texture.getContext();

    // Every constant below was measured against a 32-unit cell, so they are expressed in
    // those units and scaled up here rather than retuned to whatever the reference happens
    // to be. The fallback is never drawn by the shipped game, but it should still come out
    // looking like a car if a colour is ever added without art behind it.
    const u = PROCEDURAL_UNIT;
    const pad = 2.5 * u;
    const radius = 8 * u;
    const body = toHex(color);
    const cabin = toHex(shade(color, 0.3));
    const edge = toHex(shade(color, 0.55));

    ctx.fillStyle = body;
    roundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, radius);
    ctx.fill();

    const insetX = 5 * u;
    const insetY = 5.5 * u;
    const cabinX = pad + insetX;
    const cabinY = pad + insetY;
    const cabinW = width - (pad + insetX) * 2;
    const cabinH = height - (pad + insetY) * 2;

    ctx.fillStyle = cabin;
    roundRect(ctx, cabinX, cabinY, cabinW, cabinH, 5 * u);
    ctx.fill();

    const windowH = Math.max(4 * u, cabinH - 6 * u);
    const windowY = cabinY + (cabinH - windowH) / 2;
    ctx.fillStyle = 'rgba(233, 240, 247, 0.85)';

    const count = length >= BUS_LENGTH ? length * 2 : 2;
    const margin = 3 * u;
    const gap = 3 * u;
    const windowW =
        count > 2
            ? (cabinW - margin * 2 - gap * (count - 1)) / count
            : Math.max(4 * u, Math.min(9 * u, cabinW * 0.22));

    for (let i = 0; i < count; i++) {
        const x =
            count > 2
                ? cabinX + margin + i * (windowW + gap)
                : i === 0
                  ? cabinX + 2.5 * u
                  : cabinX + cabinW - 2.5 * u - windowW;
        roundRect(ctx, x, windowY, windowW, windowH, 2 * u);
        ctx.fill();
    }

    ctx.strokeStyle = `#${edge}`;
    ctx.lineWidth = 1.5 * u;
    const strokePad = 0.75 * u;
    roundRect(
        ctx,
        pad + strokePad,
        pad + strokePad,
        width - (pad + strokePad) * 2,
        height - (pad + strokePad) * 2,
        radius,
    );
    ctx.stroke();

    texture.refresh();
    useNearest(texture);
    cache.set(key, texture);
    return key;
}

/** Flat hex string for a packed RGB colour, padded for colours with a short representation. */
function toHex(color: number): string {
    return color.toString(16).padStart(6, '0');
}

/** The same colour pushed toward black — the cabin and outline, kept in-hue by design. */
function shade(color: number, amount: number): number {
    const r = Math.round(((color >> 16) & 0xff) * (1 - amount));
    const g = Math.round(((color >> 8) & 0xff) * (1 - amount));
    const b = Math.round((color & 0xff) * (1 - amount));
    return (r << 16) | (g << 8) | b;
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
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
