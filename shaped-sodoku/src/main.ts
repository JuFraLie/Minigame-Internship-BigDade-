import { waitForBridge } from './bridge/MpBridge.ts';

/**
 * Boot.
 *
 * Nothing but this module and the bridge are loaded until `waitForBridge()` resolves —
 * the repository rules require the game code to wait for the host, so `launch` is
 * guaranteed to have somewhere to go by the time a player can press Play. The composition
 * root is imported lazily for exactly that reason.
 *
 * If no host ever shows up the game still starts. Every bridge signal is optional —
 * the bridge module guards each send — so with nobody listening they are simply dropped,
 * which is what makes the same build runnable on its own, for instance from the committed
 * `dist/` on GitHub Pages. Refusing to start would leave that page blank forever.
 */
const boot = async (): Promise<void> => {
    if (!(await waitForBridge())) {
        console.warn('The host bridge is not available; starting the game without it.');
    }

    const { createGame } = await import('./app/composition.ts');
    createGame('game-container');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
} else {
    void boot();
}
