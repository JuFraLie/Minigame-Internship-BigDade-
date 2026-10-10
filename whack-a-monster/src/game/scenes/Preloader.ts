import Phaser from 'phaser';
import { applyRenderScale } from '../../rendering/viewport.ts';
import { CREATURE_ASSETS, generateTextures } from '../../rendering/textures.ts';

/**
 * Loads the bundled creature art and draws the procedural sprites, then hands over
 * to the Play Screen.
 *
 * Nothing gameplay-related happens here: the game never starts on its own
 * (AGENTS.md §2), so `MainMenu` is always the first screen the player sees.
 */
export class Preloader extends Phaser.Scene {
    constructor() {
        super('Preloader');
    }

    preload(): void {
        // Every file comes from public/art/ and ships with the build (AGENTS.md §3.4).
        for (const asset of CREATURE_ASSETS) {
            this.load.image(asset.key, `art/${asset.file}`);
        }
    }

    create(): void {
        applyRenderScale(this);
        generateTextures(this);
        this.scene.start('MainMenu');
    }
}
