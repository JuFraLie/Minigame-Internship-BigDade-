import type Phaser from 'phaser';

/** Shared backdrop painting, so the Play Screen, round and Result Panel share one look. */
export function paintGrass(graphics: Phaser.GameObjects.Graphics, width: number, height: number): void {
    graphics.fillStyle(0x33691e, 1);
    graphics.fillRect(0, 0, width, height);

    graphics.fillStyle(0x2e7d32, 1);
    for (let y = 0; y < height; y += 40) {
        graphics.fillRect(0, y, width, 20);
    }
}

/** Scrim drawn behind menus so text stays readable over the grass. */
export function paintDim(graphics: Phaser.GameObjects.Graphics, width: number, height: number, alpha = 0.85): void {
    graphics.fillStyle(0x0a140a, alpha);
    graphics.fillRect(0, 0, width, height);
}
