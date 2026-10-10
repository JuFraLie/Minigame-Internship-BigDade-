// bootstrap.ts — THE composition root (§4.3): the one place that constructs
// concrete implementations and wires them together. Scenes and game logic
// receive ports here; they never reach for implementations themselves.

import { CANVAS, Game as PhaserGame, Scale } from 'phaser';
import type { ActionSource, PointerFeed } from './core/types.ts';
import { Viewport } from './engine/viewport.ts';
import { Game } from './game/game.ts';
import { TouchInput } from './input/input.ts';
import { TouchPointer } from './input/pointer.ts';
import { Boot } from './scenes/Boot.ts';
import { GameOverScene } from './scenes/GameOverScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { MainMenu } from './scenes/MainMenu.ts';
import { Preloader } from './scenes/Preloader.ts';
import type { SceneDeps } from './scenes/deps.ts';
import { audio } from './services/audio.ts';
import { createHostBridge } from './services/hostBridge.ts';

export async function startGame(): Promise<void> {
  const container = document.getElementById('game-container');
  if (!container) throw new Error('#game-container not found');

  // Platform geometry: edge-to-edge playfield + screen→world mapping.
  const viewport = new Viewport(container);

  // Input adapters (§3.2, §4.3). They attach to no DOM element themselves:
  // the scenes forward Phaser's unified pointer events into them (see
  // scenes/pointerFeed.ts), and they translate screen space into game
  // semantics / world coordinates through the GameSpace port.
  const touchActions = new TouchInput();
  const pointer = new TouchPointer(viewport);

  // One feed fanned out to both adapters — every transition reaches both.
  const feed: PointerFeed = {
    down: (clientX, clientY) => {
      touchActions.down(clientX, clientY);
      pointer.down(clientX, clientY);
    },
    up: (clientX, clientY) => {
      touchActions.up(clientX, clientY);
      pointer.up(clientX, clientY);
    },
  };

  // Rules + side-effect ports (headless, renderer-free — §4.3).
  const game = new Game(viewport, audio, createHostBridge());

  // DEV ONLY: keyboard for laptop-browser testing. `import.meta.env.DEV` is
  // replaced with `false` at bundle time and the minifier drops this branch,
  // so the release build contains no keyboard code at all (§3.2). The mouse
  // needs no shim: Phaser's unified pointer model already delivers clicks as
  // the same down/up transitions as fingers (click = tap = jump,
  // press-drag-down-release = swipe = shield).
  let actions: ActionSource = touchActions;
  if (import.meta.env.DEV) {
    const { DevKeyboardInput } = await import('./input/devKeyboard.ts');
    const keys = new DevKeyboardInput();
    keys.attach();
    keys.onAnyInput = () => game.handlePlay();
    actions = {
      consume: () => keys.consume() ?? touchActions.consume(),
    };
  }

  const deps: SceneDeps = { layout: viewport, game, actions, pointer, feed };

  const phaser = new PhaserGame({
    // §4.1 / §3.4: Canvas renderer only — WebGL must never be enabled.
    type: CANVAS,
    parent: container,
    backgroundColor: '#0f0f1a',
    antialias: false,
    // §3.2: touch is the ONLY scheme and there is NO keyboard handling.
    // Phaser's own unified pointer model is the single input path — touch and
    // mouse both arrive as the same pointerdown/pointerup events, so a desktop
    // mouse works purely as a side-effect of it (no mouse-specific code).
    // `touch` must be enabled explicitly: Phaser otherwise infers it from the
    // device, which is false in a plain desktop browser.
    input: {
      keyboard: false,
      mouse: true,
      touch: true,
    },
    scale: {
      // §3.1: edge-to-edge at ANY vertical screen height — no fixed aspect
      // ratio, no letterboxing, no centering gaps.
      mode: Scale.RESIZE,
      autoCenter: Scale.NO_CENTER,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    // Template scene pipeline (§4.1): Boot → Preloader → MainMenu (Play
    // Screen) → Game (gameplay) → GameOver (Result Panel).
    scene: [
      new Boot(),
      new Preloader(deps),
      new MainMenu(deps),
      new GameScene(deps),
      new GameOverScene(deps),
    ],
  });

  // Keep the Layout in sync when the container changes size. Phaser's RESIZE
  // mode sizes its canvas to the parent automatically; the game-world geometry
  // follows from the same container rect.
  const syncSize = (): void => viewport.resize();
  window.addEventListener('resize', syncSize);
  window.addEventListener('orientationchange', syncSize);
  window.visualViewport?.addEventListener('resize', syncSize);
  void phaser;
}
