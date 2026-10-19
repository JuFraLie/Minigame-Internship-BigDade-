import Phaser from 'phaser';
import { THEME } from './theme.ts';
import { addText } from './text.ts';

/** Which theme slot a button fills: its colours come from the palette, not the call site. */
export type ButtonVariant = 'primary' | 'danger' | 'neutral';

export interface ButtonOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    /** Defaults to `primary` (filled green, white label). */
    variant?: ButtonVariant;
    fontSize?: string;
    onTap: () => void;
}

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

/**
 * Rounded, pressable label. The hit area is explicit rather than inferred, so a tap lands
 * on the button even on a very dense screen.
 */
export function createButton(scene: Phaser.Scene, options: ButtonOptions): Phaser.GameObjects.Container {
    const { x, y, width, height } = options;
    const variant = options.variant ?? 'primary';
    const colors = THEME.button[variant];
    // Filled variants carry their own contrast, so the label is white; the neutral pill is
    // pale, so it takes the dark primary text instead.
    const textColor = variant === 'neutral' ? THEME.text.primary : THEME.text.onFill;

    const graphics = scene.add.graphics();
    paintRoundedBox(graphics, -width / 2, -height / 2, width, height, height / 2, colors.fill, colors.stroke);

    const label = addText(scene, 0, 0, options.label, {
        fontSize: options.fontSize ?? '24px',
        fontStyle: 'bold',
        color: textColor,
        align: 'center',
    }).setOrigin(0.5, 0.5);

    const container = scene.add.container(x, y, [graphics, label]);
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
            scaleX: 0.96,
            scaleY: 0.96,
            duration: 60,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
        options.onTap();
    });

    return container;
}
