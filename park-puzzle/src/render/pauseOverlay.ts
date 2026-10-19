import Phaser from 'phaser';
import { addText } from './text.ts';
import { THEME } from './theme.ts';
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
        dim.fillStyle(THEME.panel.dim, THEME.panel.dimAlpha);
        dim.fillRect(0, 0, width, height);
        dim.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, width, height),
            Phaser.Geom.Rectangle.Contains,
        );
        this.dim = dim;
        this.objects.push(dim);

        // A bottom sheet rather than a centred card: it sits in thumb reach, and the
        // rounded top corners with a drag handle read as "pull me back up" at a glance.
        const sheetWidth = width - 24;
        const sheetHeight = 250;
        const sheetX = 12;
        const sheetY = height - sheetHeight - 16;

        const panel = scene.add.graphics().setDepth(DEPTH + 1);
        paintRoundedBox(
            panel,
            sheetX,
            sheetY,
            sheetWidth,
            sheetHeight,
            { tl: 26, tr: 26, bl: 18, br: 18 },
            THEME.panel.fill,
            THEME.panel.stroke,
        );

        const handle = scene.add.graphics().setDepth(DEPTH + 2);
        handle.fillStyle(THEME.panel.stroke, 1);
        handle.fillRoundedRect(width / 2 - 26, sheetY + 12, 52, 6, 3);

        const title = addText(scene, width / 2, sheetY + 52, 'PAUSED', {
            fontSize: '30px',
            fontStyle: 'bold',
            color: THEME.text.primary,
            align: 'center',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH + 2);

        const subtitle = addText(scene, width / 2, sheetY + 88, 'The ring is frozen — take your time.', {
            fontSize: '14px',
            color: THEME.text.muted,
            align: 'center',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH + 2);

        const button = createButton(scene, {
            x: width / 2,
            y: sheetY + 178,
            width: sheetWidth - 48,
            height: 62,
            label: 'RESUME',
            variant: 'primary',
            fontSize: '24px',
            onTap: onResume,
        }).setDepth(DEPTH + 3);

        this.objects.push(panel, handle, title, subtitle, button);
        this.dropping.push(panel, handle, title, subtitle, button);

        this.enter();
    }

    /**
     * Fades the overlay up over the frozen board.
     *
     * The dim layer just fades; everything on top of it also rises in from slightly below,
     * which is how a bottom sheet arrives rather than a cut. The RESUME hit area is
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
            target.y = y + 18;
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
