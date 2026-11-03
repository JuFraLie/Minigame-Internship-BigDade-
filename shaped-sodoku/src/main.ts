import { waitForBridge } from './bridge/MpBridge.ts';

/**
 * Boot.
 *
 * Nothing but this module and the bridge are loaded until `waitForBridge()` resolves —
 * the repository rules require the game code to wait for the host, so `launch` is
 * guaranteed to have somewhere to go by the time a player can press Play. The composition
 * root is imported lazily for exactly that reason.
 */
const boot = async (): Promise<void> => {
    if (!(await waitForBridge())) {
        console.error('The host bridge is not available; the game was not started.');
        return;
    }

    const { createGame } = await import('./app/composition.ts');
    createGame('game-container');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
} else {
    void boot();
}
