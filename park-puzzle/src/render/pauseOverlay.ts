import Phaser from 'phaser';
import { addText } from './text.ts';
import { createButton, paintRoundedBox } from './widgets.ts';
import { measureViewport } from './viewport.ts';

const DEPTH = 100;

/** Entrance beat: the overlay settles in rather than cutting in over the round. */
const ENTER_MS = 150;

/** Anything with a position and an alpha — the panel, the title and the button. */
type DropIn = Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Container;

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
    private readonly scene: Phaser.Scene;
    /** Full-screen tap catcher. Toggled on its own; everything else drops in. */
    private readonly dim: Phaser.GameObjects.Graphics;
    private readonly objects: Phaser.GameObjects.GameObject[] = [];
    /** The subset that drops in: `objects` minus the dim layer. */
    private readonly dropping: DropIn[] = [];

    constructor(scene: Phaser.Scene, onResume: () => void) {
        this.scene = scene;

        // Design units, read the same way every other screen reads them. `scene.scale`
        // reports the BACKING STORE (design x density), so laying the panel out against it
        // pushes RESUME past the right edge on a dense phone — the board keeps swallowing
        // taps and the round can never be resumed.
        const { width, height } = measureViewport();

        const dim = scene.add.graphics().setDepth(DEPTH);
        dim.fillStyle(0x0b0f14, 0.78);
        dim.fillRect(0, 0, width, height);
        dim.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, width, height),
            Phaser.Geom.Rectangle.Contains,
        );
        this.dim = dim;
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

        const title = addText(scene, width / 2, height / 2 - 58, 'PAUSED', {
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#ffd166',
            align: 'center',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH + 2);

        const button = createButton(scene, {
            x: width / 2,
            y: height / 2 + 40,
            width: panelWidth - 64,
            height: 66,
            label: 'RESUME',
            fill: 0x2ecc71,
            stroke: 0x27ae60,
            fontSize: '26px',
            onTap: onResume,
        }).setDepth(DEPTH + 3);

        this.objects.push(panel, title, button);
        this.dropping.push(panel, title, button);

        this.enter();
    }

    /**
     * Fades the overlay up over the frozen board.
     *
     * The dim layer just fades; everything on top of it also drops in from slightly above,
     * which reads as a sheet sliding to a halt rather than a cut. The RESUME hit area is
     * left live throughout — the tween moves the object, not its box, and it only lasts a
     * sixth of a second.
     */
    private enter(): void {
        this.dim.setAlpha(0);
        this.scene.tweens.add({
            targets: this.dim,
            alpha: 1,
            duration: ENTER_MS,
            ease: 'Quad.easeOut',
        });

        for (const target of this.dropping) {
            const y = target.y;
            target.setAlpha(0);
            target.y = y - 18;
            this.scene.tweens.add({
                targets: target,
                alpha: 1,
                y,
                duration: ENTER_MS,
                ease: 'Back.easeOut',
            });
        }
    }

    dispose(): void {
        for (const object of this.objects) {
            this.scene.tweens.killTweensOf(object);
            object.destroy();
        }
        this.objects.length = 0;
        this.dropping.length = 0;
    }
}
