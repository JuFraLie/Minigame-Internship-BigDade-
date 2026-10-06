// main.ts — Composition root.
//
// Nothing is created before the host bridge is available (AGENTS.md §4.2), and
// everything is wired here rather than inside the scenes: the headless rules
// engine, the viewport (which doubles as the engine's `Layout` port), the host
// bridge, the audio synth and the three scenes of the mandatory flow —
// MainMenu (Play Screen), Game (gameplay) and GameOver (Result Panel).

import Phaser from 'phaser';
import { THEME } from './config/gameConfig.ts';
import { Game } from './game/game.ts';
import { GameOver } from './scenes/GameOver.ts';
import { GameScene } from './scenes/Game.ts';
import { MainMenu } from './scenes/MainMenu.ts';
import type { SceneDeps } from './scenes/deps.ts';
import { renderScale, Viewport, VIEWPORT_CHANGED } from './render/viewport.ts';
import { audio } from './services/audio.ts';
import { createHostBridge } from './services/hostBridge.ts';
import { waitForBridge } from './services/MpBridge.ts';

void waitForBridge().then((ready) => {
  if (!ready) {
    console.warn('Bridge unavailable: the game was not started.');
    return;
  }

  start();
});

function start(): void {
  const viewport = new Viewport(); // Window geometry → the game's Layout port
  const bridge = createHostBridge(); // Bridge with once-only guarantees
  const game = new Game(viewport, audio, bridge); // Rules & state, headless

  const deps: SceneDeps = {
    game,
    viewport,
    unlockAudio: () => audio.unlock(),
  };

  // Phaser draws the whole screen: Canvas renderer only, no WebGL
  // (AGENTS.md §3.4, §4.1). The backing store is `renderScale()` times the
  // design size and every scene zooms its camera back by that factor, so world
  // coordinates stay in the design space the layout maths is written against.
  const app = new Phaser.Game({
    type: Phaser.CANVAS,
    width: viewport.gameW * renderScale(),
    height: viewport.gameH * renderScale(),
    parent: 'game-container',
    backgroundColor: THEME.BG_DARK,
    scale: {
      // FIT keeps the canvas inside any portrait window without stretching;
      // the centring is done by the flex on #game-container (see index.html).
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.NO_CENTER,
      expandParent: true,
    },
    scene: [new MainMenu(deps), new GameScene(deps), new GameOver(deps)],
  });

  // A window that changes size mid-session (rotation, split screen, a WebView
  // that settles late) gets a fresh playfield: the canvas is resized and the
  // active scene rebuilds its layout from the new measurements.
  const onViewportChange = (): void => {
    viewport.measure();

    const width = viewport.gameW * renderScale();
    const height = viewport.gameH * renderScale();
    if (width === app.scale.width && height === app.scale.height) return;

    app.scale.resize(width, height);
    app.events.emit(VIEWPORT_CHANGED);
  };

  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
}
