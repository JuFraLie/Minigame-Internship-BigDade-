import type Phaser from 'phaser';

/**
 * Every creature sprite ships as a bundled PNG (AGENTS.md §3.4: local assets only,
 * nothing to download and nothing to fail offline). Each file was pre-normalised to
 * the texture contract the game lays out against: a 130 x 140 canvas with the art
 * centred at (65, 74), so every state of one creature keeps the same on-screen size.
 *
 * Only the particle is still drawn procedurally, because it is a plain dot with no
 * artwork to ship.
 */

export const TEXTURE_KEYS = {
    goblinAlive: 'creature-goblin-alive',
    goblinDeath: 'creature-goblin-death',
    skeletonAlive: 'creature-skeleton-alive',
    skeletonHit: 'creature-skeleton-hit',
    skeletonDeath: 'creature-skeleton-death',
    wolfAlive: 'creature-wolf-alive',
    wolfDeath: 'creature-wolf-death',
    particle: 'fx-particle',
} as const;

/** Files loaded by the Preloader, relative to the app root (`public/art/`). */
export const CREATURE_ASSETS: readonly { key: string; file: string }[] = [
    { key: TEXTURE_KEYS.goblinAlive, file: 'goblin_alive.png' },
    { key: TEXTURE_KEYS.goblinDeath, file: 'goblin_death.png' },
    { key: TEXTURE_KEYS.skeletonAlive, file: 'skeleton_alive.png' },
    { key: TEXTURE_KEYS.skeletonHit, file: 'skeleton_hit.png' },
    { key: TEXTURE_KEYS.skeletonDeath, file: 'skeleton_death.png' },
    { key: TEXTURE_KEYS.wolfAlive, file: 'wolf_alive.png' },
    { key: TEXTURE_KEYS.wolfDeath, file: 'wolf_death.png' },
];

type MonsterKindForArt = 'normal' | 'armored' | 'ninja';

/** How a monster looks at a point in its life: alive, wounded (skeleton only), dead. */
export type MonsterArtState = 'alive' | 'hit' | 'whacked';

/** Texture key for a monster state, used by the world renderer and the Play Screen. */
export function monsterTexture(kind: MonsterKindForArt, state: MonsterArtState): string {
    switch (kind) {
        case 'armored':
            if (state === 'whacked') return TEXTURE_KEYS.skeletonDeath;
            if (state === 'hit') return TEXTURE_KEYS.skeletonHit;
            return TEXTURE_KEYS.skeletonAlive;
        case 'ninja':
            return state === 'whacked' ? TEXTURE_KEYS.wolfDeath : TEXTURE_KEYS.wolfAlive;
        default:
            return state === 'whacked' ? TEXTURE_KEYS.goblinDeath : TEXTURE_KEYS.goblinAlive;
    }
}

/** Draws the procedural sprites the game ships no artwork for. */
export function generateTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(TEXTURE_KEYS.particle)) drawParticle(scene);
}

function drawParticle(scene: Phaser.Scene): void {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(8, 8, 7);
    graphics.generateTexture(TEXTURE_KEYS.particle, 16, 16);
    graphics.destroy();
}
