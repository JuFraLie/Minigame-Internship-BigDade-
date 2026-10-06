import Phaser from 'phaser';
import { waitForBridge } from './adapters/bridge/MpBridge.ts';
import { CompositionRoot } from './app/CompositionRoot.ts';
import { GameScene } from './presentation/scenes/GameScene.ts';
import { GameOverScene } from './presentation/scenes/GameOverScene.ts';
import { MainMenuScene } from './presentation/scenes/MainMenuScene.ts';
import { NIGHT_HEX } from './presentation/palette.ts';

/**
 * Portrait-only game: the canvas always follows the device aspect ratio,
 * clamped so it is never *wider* than 9:16.
 *
 * - Phone (every modern one is taller than 9:16) -> the design space equals
 *   the viewport, so the game is genuinely edge-to-edge and fills every pixel.
 * - Squarer screen (tablet, desktop window) -> clamped to 9:16 and centred,
 *   i.e. letterboxed rather than given a layout of its own.
 *
 * Only the width flexes: reachability is vertical, so a width change never
 * alters a gameplay outcome. Nothing here targets a fixed ratio
 * (AGENTS.md A3.1) - the height always comes from the device.
 */
const MAX_ASPECT = 9 / 16;
/** Nothing is designed taller than 2.5:1; below this the game letterboxes. */
const MIN_ASPECT = 0.4;

const designSize = (): { width: number; height: number } => {
  const height = window.innerHeight;
  const aspect = Math.min(Math.max(window.innerWidth / height, MIN_ASPECT), MAX_ASPECT);
  return { width: Math.round(height * aspect), height };
};

/**
 * Entry point.
 *
 * No game code runs before the host bridge is available (AGENTS.md A4.2);
 * everything is wired once, in the composition root, and handed to the scenes
 * through the Phaser registry.
 */
const boot = async (): Promise<void> => {
  if (!(await waitForBridge())) {
    console.error('MpBridge is not available; the game will not start.');
    return;
  }

  const root = new CompositionRoot();
  const size = designSize();

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game-container',
    backgroundColor: NIGHT_HEX,
    width: size.width,
    height: size.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      // The parent already fills the viewport; expanding it to the canvas
      // would defeat the centring in the letterboxed case.
      expandParent: false,
    },
    // Four so a stray second thumb has a pointer of its own instead of
    // fighting the one that is steering.
    input: { activePointers: 4 },
    scene: [MainMenuScene, GameScene, GameOverScene],
  });

  game.registry.set('ctx', root);

  // Rotation or a window resize changes the design space, so re-derive it.
  //
  // Two Phaser details make this more than a plain `resize`:
  //  - under FIT, `displaySize` keeps the design *ratio* and only constrains it
  //    into the parent, so the ratio has to be re-set for a new aspect;
  //  - `updateScale()` runs before `updateBounds()`, so the first pass still
  //    sees the previous parent size - one `refresh()` catches it up.
  window.addEventListener('resize', () => {
    const next = designSize();
    if (next.width !== game.scale.width || next.height !== game.scale.height) {
      game.scale.displaySize.setAspectRatio(next.width / next.height);
      game.scale.resize(next.width, next.height);
      game.scale.refresh();
    }
  });
};

void boot();
