import Phaser from 'phaser';
import { THEME } from './theme.ts';
import { addText } from './text.ts';

/** Corner radii for a rounded box, or a single number for all four. */
export type CornerRadii = number | { tl?: number; tr?: number; br?: number; bl?: number };

/** Rounded box painter shared by buttons, panels and chips. */
export function paintRoundedBox(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: CornerRadii,
    fill: number,
    stroke: number,
    alpha = 1,
    lineWidth = 3,
): void {
    graphics.fillStyle(fill, alpha);
    graphics.fillRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(lineWidth, stroke, 1);
    graphics.strokeRoundedRect(x, y, width, height, radius);
}

/** Extra drawing options for `paintSticker`, all defaulted to the arcade look. */
export interface StickerOptions {
    /** Horizontal offset of the extruded shadow. Defaults to 7. */
    shadowX?: number;
    /** Vertical offset of the extruded shadow. Defaults to 9. */
    shadowY?: number;
    /** Ink outline width. Defaults to 4. */
    lineWidth?: number;
    /** Strength of the glossy top strip. Defaults to 0.24; 0 omits it. */
    glossAlpha?: number;
}

/**
 * The arcade sticker slab: an extruded ink shadow, a heavy ink outline and a glossy top
 * strip over a filled body.
 *
 * This is the one construction every card, plate and button on the Play Screen, the
 * Result Panel and the gameplay HUD is drawn from, which is what keeps the three screens
 * reading as one game rather than as three skins layered over it.
 */
export function paintSticker(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: CornerRadii,
    fill: number,
    options: StickerOptions = {},
): void {
    const shadowX = options.shadowX ?? 7;
    const shadowY = options.shadowY ?? 9;
    const lineWidth = options.lineWidth ?? 4;
    const glossAlpha = options.glossAlpha ?? 0.24;

    graphics.fillStyle(THEME.menu.ink, 1);
    graphics.fillRoundedRect(x + shadowX, y + shadowY, width, height, radius);
    paintRoundedBox(graphics, x, y, width, height, radius, fill, THEME.menu.ink, 1, lineWidth);

    if (glossAlpha > 0) {
        graphics.fillStyle(0xffffff, glossAlpha);
        const corners =
            typeof radius === 'number'
                ? { tl: Math.max(4, radius - 4), tr: Math.max(4, radius - 4), br: 4, bl: 4 }
                : radius;
        graphics.fillRoundedRect(x + 6, y + 5, width - 12, height * 0.36, corners);
    }
}

export interface ArcadeButtonOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    /** Gloss strip colour, the top half of the slab. */
    topColour: number;
    /** Slab body colour, the bottom half. */
    bodyColour: number;
    /** Label ink. Defaults to the cream logo ink used on a filled slab. */
    labelColour?: string;
    /** Outline behind the label. Pass an empty string to drop the stroke on a pale slab. */
    strokeColour?: string;
    /** Label size in px. Steps down automatically if the label would overrun the slab. */
    fontSize?: number;
    onTap: () => void;
    /** Idle bob tweens are pushed here so the owner can stop them on teardown. */
    loops?: Phaser.Tweens.Tween[];
}

/**
 * The arcade slab button: ink extrusion, two-tone body, glossy top half and a stroked
 * label. The Play Screen's MULAI, the Result Panel's buttons and the HUD's pause all use
 * it, so every pressable thing in the game is built the same way.
 */
export function createArcadeButton(
    scene: Phaser.Scene,
    options: ArcadeButtonOptions,
): Phaser.GameObjects.Container {
    const { x, y, width, height } = options;
    const labelColour = options.labelColour ?? THEME.menu.logoInk;
    // A pale slab takes no outline behind its dark label; a filled one needs it to keep
    // the cream ink off the body colour.
    const strokeColour = options.strokeColour ?? THEME.menu.inkCss;
    const radius = Math.min(20, height / 2);

    const container = scene.add.container(x, y);
    const graphics = scene.add.graphics();
    paintSticker(graphics, -width / 2, -height / 2, width, height, radius, options.bodyColour, {
        shadowY: 8,
        glossAlpha: 0,
    });
    // The gloss is drawn only over the top part, so the slab reads as pressed plastic.
    graphics.fillStyle(options.topColour, 1);
    graphics.fillRoundedRect(
        -width / 2 + 6,
        -height / 2 + 5,
        width - 12,
        height * 0.4,
        { tl: radius - 6, tr: radius - 6, br: 5, bl: 5 },
    );
    container.add(graphics);

    const label = addText(scene, 0, 0, options.label, {
        fontSize: `${options.fontSize ?? 24}px`,
        fontStyle: 'bold',
        color: labelColour,
        align: 'center',
        stroke: strokeColour || undefined,
        strokeThickness: strokeColour ? 6 : 0,
        letterSpacing: 2,
        // The shadow only belongs under a cream label on a filled slab, where it is what
        // extrudes the type off the body. A pale slab's label is already dark, so the same
        // near-black shadow lands on it and just doubles every glyph into a smear.
        shadow: strokeColour ? { x: 0, y: 3, color: THEME.menu.shadowCss, stroke: false } : undefined,
    }).setOrigin(0.5, 0.5);

    // A long label steps down rather than running past the slab's edges.
    let size = options.fontSize ?? 24;
    while (label.width > width - 28 && size > 15) {
        size -= 2;
        label.setFontSize(size);
    }
    container.add(label);

    container.setSize(width, height);
    // Phaser normalises a hit test by the game object's `displayOrigin`, which for a
    // Container is always `width * 0.5` / `height * 0.5`. The point handed to the hit
    // area is therefore top-left relative, not centre relative, so the area runs from
    // (0, 0) to (width, height) — exactly the box that was drawn above. Offsetting it
    // by half the size again would leave only the top-left quarter of the button
    // tappable, which reads on a touchscreen as "the button does not respond".
    container.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, width, height),
        Phaser.Geom.Rectangle.Contains,
    );

    container.on('pointerdown', () => {
        scene.tweens.add({
            targets: container,
            scaleX: 0.95,
            scaleY: 0.95,
            duration: 60,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
        options.onTap();
    });

    // The bob runs on `y` and the press on `scale`, so the two never fight over the
    // same property — and the button reads as pressable before it is ever pressed.
    if (options.loops) {
        options.loops.push(
            scene.tweens.add({
                targets: container,
                y: y - 5,
                duration: 1150,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            }),
        );
    }

    return container;
}
