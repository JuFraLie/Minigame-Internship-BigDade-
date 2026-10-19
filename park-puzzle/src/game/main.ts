import Phaser from 'phaser';
import { designSize, renderScale, VIEWPORT_CHANGED } from '../render/viewport.ts';
import { THEME } from '../render/theme.ts';
import { GameView } from '../render/gameView.ts';
import { Game } from './scenes/Game.ts';
import { GameOver } from './scenes/GameOver.ts';
import { MainMenu } from './scenes/MainMenu.ts';

/**
 * Builds the Phaser game.
 *
 * The scenes map onto the mandatory flow: `MainMenu` is the Play Screen, `Game` is the
 * round and `GameOver` is the Result Panel.
 *
 * Renderer choice is deliberate: `Phaser.CANVAS` keeps the whole game on HTML5 Canvas 2D —
 * WebGL is never enabled (AGENTS.md §3.4, §4.1).
 *
 * The backing store is the design size times `renderScale()`, so a high-density phone gets
 * a sharp canvas; every scene zooms its camera by the same factor and therefore keeps
 * working in plain design units. `Scale.FIT` never stretches the canvas, and centring is
 * left to the CSS flex on `#game-container` — Phaser's `autoCenter` writes margins that a
 * flex parent centres a second time, producing a visible offset.
 */
export const StartGame = (parent: string): Phaser.Game => {
    const { width, height } = designSize();
    const density = renderScale();

    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.CANVAS,
        width: width * density,
        height: height * density,
        parent,
        backgroundColor: THEME.bgCss,
        // Nearest-neighbour sampling, so the flat art stays crisp instead of being
        // bilinearly smeared. Textures decide this individually in the Canvas renderer
        // (`!frame.source.scaleMode`), so this is only the fallback for anything that does
        // not carry its own mode — see `useNearest`.
        antialias: false,
        // Phaser only builds its Touch Manager when the *device* claims touch support
        // (`ontouchstart` or `navigator.maxTouchPoints`), a sniff that comes back false on a
        // desktop and under DevTools device emulation. With it false Phaser binds no
        // `touch*` listener at all, so a finger reaches the canvas and the game simply
        // never hears it, while the cursor keeps working — which reads as "swiping does
        // nothing". The game is touch-first inside a host WebView, so touch input is
        // switched on outright instead of being left to the browser to volunteer it.
        input: {
            touch: true,
        },
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.NO_CENTER,
            expandParent: true,
        },
        scene: [MainMenu, Game, GameOver],
    };

    const game = new Phaser.Game(config);

    // The padlock is painted once here rather than by the view that first needs it, so the
    // texture exists by the time a car is blocked and the view never races the texture
    // pool.
    game.events.once('ready', () => {
        const boot = game.scene.getScene('MainMenu');
        if (boot) GameView.ensureLockTexture(boot);
    });

    // The canvas is sized from the window once at boot; keep it that way when the window
    // changes later, and only then tell the screens to lay out again. Sizing first
    // matters: a screen that rebuilds must find the backing store already describing its
    // new space, otherwise the HUD and the board are drawn outside the canvas.
    let appliedWidth = width * density;
    let appliedHeight = height * density;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const applyResize = (): void => {
        resizeTimer = null;

        // Measure the window first. The Scale Manager only re-reads its parent at the end
        // of a refresh, so fitting without this would size the canvas for the *previous*
        // window and overflow it.
        game.scale.getParentBounds();

        const size = designSize();
        const targetWidth = size.width * density;
        const targetHeight = size.height * density;

        if (targetWidth !== appliedWidth || targetHeight !== appliedHeight) {
            appliedWidth = targetWidth;
            appliedHeight = targetHeight;
            game.scale.setGameSize(targetWidth, targetHeight);
            game.events.emit(VIEWPORT_CHANGED);
            return;
        }

        // Same design size, new window: only the fit into the window has to be recomputed.
        game.scale.refresh();
        game.events.emit(VIEWPORT_CHANGED);
    };

    // Trailing debounce. A single drag or a WebView settling fires a burst of resizes, and
    // each one repaints the board texture and re-lays out the HUD — doing that on every
    // event makes the window visibly stutter while it is still being dragged. The first
    // event is applied on the next tick rather than immediately, so the burst still
    // resolves in one frame instead of deferring the very first repaint by the full window.
    window.addEventListener('resize', () => {
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyResize, 80);
    });

    return game;
};
