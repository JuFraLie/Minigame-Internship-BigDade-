import Phaser from 'phaser';

import { renderScale } from '../app/viewport.ts';
import { FONT_STACK } from '../render/palette.ts';

/**
 * The two scenes that own buttons draw them the same way, so the button lives here.
 *
 * There is no bitmap button anywhere: a Graphics rectangle plus a Text label, grouped in a
 * container with an explicit hit area. It presses down a little on touch for feedback and
 * then fires — immediately, because waiting for a touch to lift feels laggy on a phone.
 */

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
}

export function createButton(scene: Phaser.Scene, options: ButtonOptions): Phaser.GameObjects.Container {
    const { x, y, width, height, label, fill, labelColour, fontSize, onPress } = options;
    const radius = height * 0.34;

    const background = scene.add.graphics();
    background.fillStyle(fill, 1);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    background.lineStyle(3, 0x161a3a, 0.45);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);

    const text = scene.add
        .text(0, 0, label, {
            fontFamily: FONT_STACK,
            fontSize: `${fontSize}px`,
            fontStyle: 'bold',
            color: labelColour,
            // Must arrive in the style: Phaser stamps the resolution onto the texture
            // source once, while the Text is being built. See `addLabel` below.
            resolution: renderScale(),
        })
        .setOrigin(0.5);

    const container = scene.add.container(x, y, [background, text]);
    container.setSize(width, height);
    container.setInteractive();

    container.on('pointerdown', () => {
        scene.tweens.add({
            targets: container,
            scaleX: 0.94,
            scaleY: 0.94,
            duration: 70,
            yoyo: true,
            ease: 'Sine.easeOut',
        });
        onPress();
    });

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
 * times too big.
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
