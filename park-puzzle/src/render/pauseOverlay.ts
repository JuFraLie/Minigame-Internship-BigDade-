import Phaser from 'phaser';
import { addText } from './text.ts';
import { createButton, paintRoundedBox } from './widgets.ts';

const DEPTH = 100;

/**
 * The pause overlay (AGENTS.md §2: pause MAY exist, but it MUST only resume).
 *
 * There is deliberately no restart and no exit here — a player who wants out mid-round
 * uses the host app's own navigation, so the score is always finalised on the Result
 * Panel before anything can be restarted or left.
 *
 * The pieces are added to the scene directly rather than grouped in a container: the dim
 * panel is what swallows taps aimed at the board underneath, and keeping it a plain
 * game object makes the "overlay blocks, button wins" ordering explicit instead of
 * relying on how Phaser descends into interactive containers.
 */
export class PauseOverlay {
    private readonly objects: Phaser.GameObjects.GameObject[] = [];

    constructor(scene: Phaser.Scene, onResume: () => void) {
        const { width, height } = scene.scale;

        const dim = scene.add.graphics().setDepth(DEPTH);
        dim.fillStyle(0x0b0f14, 0.78);
        dim.fillRect(0, 0, width, height);
        dim.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, width, height),
            Phaser.Geom.Rectangle.Contains,
        );
        this.objects.push(dim);

        const panelWidth = Math.min(320, width - 56);
        const panel = scene.add.graphics().setDepth(DEPTH + 1);
        paintRoundedBox(
            panel,
            width / 2 - panelWidth / 2,
            height / 2 - 110,
            panelWidth,
            220,
            20,
            0x232d39,
            0x3f4d5c,
        );
        this.objects.push(panel);

        this.objects.push(
            addText(scene, width / 2, height / 2 - 58, 'PAUSED', {
                fontSize: '34px',
                fontStyle: 'bold',
                color: '#ffd166',
                align: 'center',
            })
                .setOrigin(0.5, 0.5)
                .setDepth(DEPTH + 2),
        );

        this.objects.push(
            createButton(scene, {
                x: width / 2,
                y: height / 2 + 40,
                width: panelWidth - 64,
                height: 66,
                label: 'RESUME',
                fill: 0x2ecc71,
                stroke: 0x27ae60,
                fontSize: '26px',
                onTap: onResume,
            }).setDepth(DEPTH + 3),
        );
    }

    dispose(): void {
        for (const object of this.objects) object.destroy();
        this.objects.length = 0;
    }
}
