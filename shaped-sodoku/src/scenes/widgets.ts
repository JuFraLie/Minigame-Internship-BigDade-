import Phaser from 'phaser';

import { renderScale } from '../app/viewport.ts';
import { darken, drawBevel } from '../render/Chunky.ts';
import { DISPLAY_STACK, FONT_STACK } from '../render/palette.ts';

/**
 * The two scenes that own buttons draw them the same way, so the button lives here.
 *
 * There is no bitmap button anywhere: a bevelled Graphics slab plus a Text label, grouped
 * in a container with an explicit hit area. It squashes on touch, springs back the moment
 * the finger lifts, and drops into the screen on first appearance — the three beats that
 * make a tappable thing on a phone feel like an object rather than a rectangle.
 *
 * It fires on `pointerdown`, never on `pointerup`: waiting for a touch to lift feels laggy.
 */

/**
 * Anything that can fade, slide and bounce its way onto the screen.
 *
 * Deliberately structural rather than an intersection of Phaser's components: `Graphics`
 * implements plain `Alpha` but not the four-corner `AlphaMulti` one, so a component
 * intersection would exclude exactly the objects the panels and ribbons are drawn with.
 * Named here rather than in each scene, so the Play Screen and the Result Panel stage
 * their entrances through the same contract.
 */
export type Arrivable = {
    /** World Y. Claimed by the entrance, then handed back to whoever owns it next. */
    y: number;
    /** Opacity at the start of the entrance. */
    setAlpha(value: number): unknown;
};

export interface ButtonOptions {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly label: string;
    readonly fill: number;
    readonly labelColour: string;
    readonly fontSize: number;
    readonly onPress: () => void;
    /** Milliseconds to hold this button back while siblings arrive first. */
    readonly enterDelay?: number;
    /** Set `false` to appear already in place, e.g. when a redraw must not animate. */
    readonly enter?: boolean;
}

export function createButton(scene: Phaser.Scene, options: ButtonOptions): Phaser.GameObjects.Container {
    const { x, y, width, height, label, fill, labelColour, fontSize, onPress } = options;
    const radius = height * 0.34;
    const depth = Math.max(4, Math.round(height * 0.16));

    const background = scene.add.graphics();
    drawBevel(background, -width / 2, -height / 2, width, height, radius, {
        fill,
        depth,
        drop: Math.max(3, Math.round(height * 0.12)),
        outline: darken(fill, 0.5),
        outlineWidth: 3,
        gloss: 0.3,
    });

    const text = scene.add
        .text(0, 0, label, {
            fontFamily: DISPLAY_STACK,
            fontSize: `${fontSize}px`,
            fontStyle: 'bold',
            color: labelColour,
            stroke: '#15183c',
            strokeThickness: Math.max(2, Math.round(fontSize * 0.13)),
            // A hard, unblurred offset: the whole glyph — stroke included — casts it, so
            // the label sits on the button instead of floating above it.
            shadow: {
                offsetX: 0,
                offsetY: Math.max(1, Math.round(fontSize * 0.07)),
                color: '#0b0e28',
                blur: 0,
                fill: true,
                stroke: true,
            },
            // Must arrive in the style: Phaser stamps the resolution onto the texture
            // source once, while the Text is being built. See `addLabel` below.
            resolution: renderScale(),
        })
        .setOrigin(0.5);

    const container = scene.add.container(x, y, [background, text]);
    // The bevel sits `depth` below the face, so the touchable area has to include it.
    container.setSize(width, height + depth);
    container.setInteractive();

    // A scene change destroys this container, and its release handler would happily keep
    // tweening a corpse afterwards — so the scene's own shutdown closes the gate.
    let alive = true;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        alive = false;
    });

    const spring = (): void => {
        if (!alive) return;
        scene.tweens.killTweensOf(container as unknown as object);
        container.setAlpha(1);
        scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 240, ease: 'Back.easeOut' });
    };

    container.on('pointerdown', () => {
        if (!alive) return;
        scene.tweens.killTweensOf(container as unknown as object);
        // A tap can land mid-entrance. Arrive in full before squashing, so the press reads
        // as the button travelling down rather than as a jump in scale out of nowhere.
        container.setAlpha(1).setScale(1);
        // Squash rather than shrink: the button keeps its width and loses its height, which
        // is how a real button travels when it is pressed.
        scene.tweens.add({ targets: container, scaleX: 0.97, scaleY: 0.88, duration: 70, ease: 'Quad.easeOut' });
        onPress();
    });
    container.on('pointerup', spring);
    container.on('pointerupoutside', spring);
    container.on('pointerout', spring);

    if (options.enter !== false) {
        const delay = options.enterDelay ?? 0;
        container.setScale(0.5).setAlpha(0);
        // Alpha and scale travel separately: `Back` overshoots past 1 on scale, which is the
        // bounce, but overshooting alpha would leave the sprite stranded half-transparent.
        scene.tweens.add({ targets: container, alpha: 1, duration: 300, delay, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 520, delay, ease: 'Back.easeOut' });
    }

    return container;
}

/**
 * Centred text with the game's font stack.
 *
 * `resolution` is forced here rather than left to callers. The canvas backing store is
 * `renderScale()` times the design size and the camera zooms back by the same factor, so
 * world coordinates stay in design units — but a text canvas is only ever rasterised at
 * its own resolution. Left at the default of 1, glyphs are drawn at design size and then
 * magnified by the camera: the right size, but blurred on any density above 1×.
 *
 * It has to arrive in the style at construction. Phaser stamps `frame.source.resolution`
 * exactly once, while the Text is being built, and the canvas renderer divides the size
 * it draws by that stamp; calling `setResolution()` afterwards rebuilds the — larger —
 * text canvas without re-stamping the source, so every glyph is then drawn `renderScale()`
 * times too big. Shrinking the font size later is safe: that path re-renders through the
 * same stored resolution rather than touching the stamp.
 */
export function addLabel(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
    return scene.add
        .text(x, y, text, { fontFamily: FONT_STACK, ...style, resolution: renderScale() })
        .setOrigin(0.5);
}

/**
 * A label that is shrunk until it fits `maxWidth`, for headings that must stay on one line.
 *
 * The display face is wide and its metrics differ per platform, so a size that fits Windows
 * can overrun on a phone. Measuring after construction and stepping the font size down is
 * the only way to guarantee the fit without shipping a font of our own.
 */
export function fitLabel(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    maxWidth: number,
): Phaser.GameObjects.Text {
    const label = addLabel(scene, x, y, text, style);
    const rawSize = style.fontSize;
    const initial = typeof rawSize === 'number' ? rawSize : Number.parseInt(String(rawSize ?? ''), 10);
    if (!Number.isFinite(initial)) return label;

    let size = initial;
    const rebuild = (): void => {
        // Phaser sizes a line box at `fontSize + strokeThickness`, which is tighter than the
        // glyphs themselves: two stacked lines would otherwise sit on top of each other.
        if (label.text.split('\n').length > 1) label.lineSpacing = Math.round(size * 0.16);
        label.updateText();
    };

    rebuild();
    while (label.width > maxWidth && size > 10) {
        size = Math.max(10, Math.round(size * 0.94));
        label.setFontSize(size);
        rebuild();
    }

    return label;
}
