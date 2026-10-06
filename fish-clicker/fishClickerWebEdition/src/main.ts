import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './config/LayoutConfig';
import { state, Status } from './core/GameState';
import { prepareStartScreen, tick } from './core/FishingFSM';
import { loadAssets } from './render/AssetManager';
import { updateAnimation } from './render/VisualFX';
import { render } from './render/GameRenderer';
import { initInput } from './input/InputManager';
import { loadSounds } from './audio/AudioManager';
import { waitForBridge } from './platform/MpBridge';

const boot = async (): Promise<void> => {
  // MpBridge: no game code may run before the host bridge is ready.
  if (!(await waitForBridge())) {
    console.error('MpBridge is not available; the game will not start.');
    return;
  }

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  let scale = 1;

  // The visible viewport: on mobile, 100vh/innerHeight can include the area
  // behind the browser toolbar, so prefer visualViewport when it exists.
  function viewportSize(): { width: number; height: number } {
    const vv = window.visualViewport;
    return {
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight,
    };
  }

  function resize(): void {
    const { width, height } = viewportSize();
    const windowRatio = width / height;
    const logicalRatio = LOGICAL_WIDTH / LOGICAL_HEIGHT;

    if (windowRatio < logicalRatio) {
      scale = width / LOGICAL_WIDTH;
    } else {
      scale = height / LOGICAL_HEIGHT;
    }

    canvas.width = LOGICAL_WIDTH * scale;
    canvas.height = LOGICAL_HEIGHT * scale;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Match the flex container to the visible viewport so the canvas centers
    // correctly instead of being pushed off the bottom.
    document.body.style.height = `${height}px`;
  }

  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  initInput(canvas, () => scale);
  loadAssets();
  loadSounds();
  // Title screen: the round (and the `launch` / `startRound` host signals)
  // only begin once the player presses start.
  prepareStartScreen();

  let lastTime = 0;
  function update(time: number): void {
    if (lastTime === 0) lastTime = time;
    const delta = (time - lastTime) / 1000.0;
    lastTime = time;

    updateAnimation(delta);

    if (state.status !== Status.GAMEOVER) {
      tick(delta);
    }

    render(ctx);
    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
};

void boot();

