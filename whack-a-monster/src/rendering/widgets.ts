import Phaser from 'phaser';
import { addText } from './text.ts';

export interface ButtonOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    fill: number;
    stroke: number;
    fontSize?: string;
    textColor?: string;
    onTap: () => void;
}

/** Rounded box painter shared by buttons and panels. */
export function paintRoundedBox(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: number,
    stroke: number,
    alpha = 1,
): void {
    graphics.fillStyle(fill, alpha);
    graphics.fillRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(3, stroke, 1);
    graphics.strokeRoundedRect(x, y, width, height, radius);
}

/**
 * Rounded, pressable label. The hit area is explicit rather than inferred, so a tap lands
 * on the button even on a very dense screen.
 */
export function createButton(scene: Phaser.Scene, options: ButtonOptions): Phaser.GameObjects.Container {
    const { x, y, width, height } = options;

    const graphics = scene.add.graphics();
    paintRoundedBox(graphics, -width / 2, -height / 2, width, height, height / 2, options.fill, options.stroke);

    const label = addText(scene, 0, 0, options.label, {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: options.fontSize ?? '24px',
        fontStyle: 'bold',
        color: options.textColor ?? '#ffffff',
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
