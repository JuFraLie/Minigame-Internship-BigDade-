// main.ts — entry point.
// jsbridge rule: the page MUST NOT load game code before the host bridge
// is available, so this file only waits for the bridge and then lazy-loads
// everything else (the composition root and the game).

import { waitForBridge } from './services/jsbridge.ts';

const boot = async (): Promise<void> => {
  if (!(await waitForBridge())) {
    console.error('MpPostMessage bridge is not available; the game will not start.');
    return;
  }

  const { startGame } = await import('./bootstrap.ts');
  startGame();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
} else {
  void boot();
}
