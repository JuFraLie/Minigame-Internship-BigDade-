import type Phaser from 'phaser';
import type { MonsterKind } from '../core/config.ts';
import { paintDim, paintGrass } from './backdrop.ts';
import { computeLayout, topPadding } from './layout.ts';
import { addText } from './text.ts';
import { monsterTexture } from './textures.ts';
import { measureViewport } from './viewport.ts';
import { createButton } from './widgets.ts';

/** What the Play Screen can ask for; implemented by the scene that owns the flow. */
export interface MenuActions {
    /** Starts the round: the PLAY button and the tap-anywhere listener both call it. */
    onStart(): void;
}

/**
 * Everything the Play Screen draws: backdrop, title, how-to, the monster key and the
 * PLAY button.
 *
 * It draws and decides nothing else — flow stays in the scene (the `launch` signal, the
 * scene change), which injects it through `MenuActions`. The view is replaceable drawing
 * over the same round a headless test could drive (AGENTS.md §4.3).
 */
export class MenuView {
    private readonly scene: Phaser.Scene;
    private readonly actions: MenuActions;

    constructor(scene: Phaser.Scene, actions: MenuActions) {
        this.scene = scene;
        this.actions = actions;
        this.draw();
    }

    /** Draws the Play Screen again at the current screen size (a resize, not a restart). */
    rebuild(): void {
        this.dispose();
        this.draw();
    }

    /** Destroys only this screen's drawing, leaving the scene's input listeners alone. */
    dispose(): void {
        for (const object of [...this.scene.children.list]) object.destroy();
    }

    /**
     * Draws the Play Screen at the current screen size. Split from the constructor so a
     * viewport change can lay it out again (AGENTS.md §3.1: it has to fit any screen height).
     */
    private draw(): void {
        const viewport = measureViewport();
        // The menu reuses the round's layout maths so the top padding that keeps the title
        // clear of the status bar / cutout is identical in both screens.
        const layout = computeLayout(viewport);
        const width = viewport.width;
        const height = viewport.height;
        const top = topPadding(layout.viewport);

        const backdrop = this.scene.add.graphics().setDepth(0);
        paintGrass(backdrop, width, height);
        paintDim(backdrop, width, height, 0.55);

        const title = addText(this.scene, width / 2, top + 70, 'WHACK-A-MONSTER', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '44px',
            fontStyle: 'bold',
            color: '#ffeb3b',
            stroke: '#1b1226',
            strokeThickness: 10,
            align: 'center',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(1);
        // The title is laid out in design units, so on a narrow phone it can outgrow the
        // screen; it is only ever scaled down, never up.
        title.setScale(Math.min(1, (width - 36) / Math.max(1, title.width)));

        const howTo = addText(
            this.scene,
            width / 2,
            top + 130,
            'Tap a goblin to whack it — skeletons take two taps. Swipe across a wolf to slash it, and never let three monsters escape!',
            {
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '19px',
                color: '#eceff1',
                align: 'center',
                lineSpacing: 5,
                wordWrap: { width: width - 70 },
            },
        )
            .setOrigin(0.5, 0)
            .setDepth(1);

        // On a narrow screen the how-to wraps into more lines, so the monster key starts
        // below whatever height it ended up with instead of a fixed offset.
        this.drawMonsterKey(width, top + 130 + howTo.height + 24);

        createButton(this.scene, {
            x: width / 2,
            y: height - height * 0.03 - 130,
            width: Math.min(width - 80, 340),
            height: 82,
            label: 'PLAY',
            fill: 0x2e7d32,
            stroke: 0xa5d6a7,
            fontSize: '34px',
            onTap: () => this.actions.onStart(),
        }).setDepth(2);

        addText(this.scene, width / 2, height - height * 0.03 - 66, 'OR TAP ANYWHERE', {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#b0bec5',
        })
            .setOrigin(0.5, 0.5)
            .setDepth(1);
    }

    /** The three monster types and how to beat them. `top` is the top of the sprites. */
    private drawMonsterKey(width: number, top: number): void {
        const entries: { kind: MonsterKind; label: string; hint: string }[] = [
            { kind: 'normal', label: 'GOBLIN', hint: '1 TAP' },
            { kind: 'armored', label: 'SKELETON', hint: '2 TAPS' },
            { kind: 'ninja', label: 'WOLF', hint: 'SWIPE' },
        ];

        const slotWidth = width / entries.length;
        // The sprites are drawn at a fixed design size, so they are only ever scaled down
        // on a narrow phone.
        const spriteScale = Math.min(1, (slotWidth - 26) / 130);

        entries.forEach((entry, index) => {
            const x = slotWidth * (index + 0.5);

            const sprite = this.scene.add
                .image(x, top, monsterTexture(entry.kind, 'alive'))
                .setOrigin(0.5, 0)
                .setScale(spriteScale)
                .setDepth(1);

            addText(this.scene, x, top + sprite.height * spriteScale + 16, entry.label, {
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '17px',
                fontStyle: 'bold',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 5,
            })
                .setOrigin(0.5, 0)
                .setDepth(1);

            addText(this.scene, x, top + sprite.height * spriteScale + 40, entry.hint, {
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color: '#ffd54a',
                stroke: '#000000',
                strokeThickness: 4,
            })
                .setOrigin(0.5, 0)
                .setDepth(1);
        });
    }
}
