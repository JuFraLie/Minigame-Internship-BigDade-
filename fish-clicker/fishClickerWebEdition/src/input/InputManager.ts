import { inBounds } from './PointUtils';
import { buttons } from '../config/LayoutConfig';
import { gameOverInputLockMs } from '../config/GameConfig';
import { state, Status } from '../core/GameState';
import { handleRestartTap, handleFirstInteraction, handleExitTap, handleNextAreaTap, handleUpgradeTap, handleFishTap, handleStartTap } from './UIOrchestrator';


function handleTap(lx: number, ly: number): void {
  if (state.status === Status.READY) {
    // The play button on the first screen starts the round (and sends `launch`).
    if (inBounds(lx, ly, buttons.start)) {
      handleStartTap();
    }
    return;
  }

  if (state.status === Status.GAMEOVER) {
    // Ignore taps for a moment so spam taps don't accidentally hit Restart/Exit.
    if (Date.now() < state.gameOverAt + gameOverInputLockMs) return;
    if (inBounds(lx, ly, buttons.restart)) {
      handleRestartTap();
    } else if (inBounds(lx, ly, buttons.exit)) {
      handleExitTap();
    }
    return;
  }

  if (inBounds(lx, ly, buttons.nextArea)) {
    handleNextAreaTap();
    return;
  }

  if (inBounds(lx, ly, buttons.upgrade)) {
    handleUpgradeTap();
    return;
  }

  if (inBounds(lx, ly, buttons.fish)) {
    handleFishTap();
  }
}

export function initInput(canvas: HTMLCanvasElement, getScale: () => number): void {
  let interacted = false;
  function markInteracted() {
    if (!interacted) {
      interacted = true;
      handleFirstInteraction();
    }
  }

  function handleTouch(x: number, y: number) {
    markInteracted();
    const rect = canvas.getBoundingClientRect();
    const scale = getScale();
    const lx = (x - rect.left) / scale;
    const ly = (y - rect.top) / scale;
    handleTap(lx, ly);
  }

  canvas.addEventListener('mousedown', (e) => handleTouch(e.clientX, e.clientY));
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      handleTouch(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (state.status === Status.GAMEOVER) return;
    markInteracted();
    if (state.status === Status.READY) {
      handleStartTap();
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'd' || key === 'f' || key === 'j' || key === 'k') {
      handleFishTap();
    }
  });
}
