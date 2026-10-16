import { defineConfig, type Plugin } from 'vite';

/**
 * `MpBridge.ts` ships with `IS_DEVELOPMENT_MODE = true` so `npm run dev` boots
 * in a plain browser (the host never injects `window.MpPostMessage` there).
 * The embedded WebView bundle must have it `false` (AGENTS.md §4.2: no game
 * code before the bridge exists), so the release build rewrites the flag and
 * fails loudly if the expected line is ever missing.
 *
 * EXCEPTION: the standalone web build (`vite build --mode standalone`, used by
 * Vercel) runs in a plain browser where no host ever injects the bridge, so it
 * skips this plugin and ships `IS_DEVELOPMENT_MODE = true` — otherwise
 * `waitForBridge()` would time out after 5s and the game would never boot.
 * Every `webviewSignal*` call then simply no-ops via optional chaining.
 */
function releaseBridgeFlag(): Plugin {
  const from = 'export const IS_DEVELOPMENT_MODE = true;';
  const to = 'export const IS_DEVELOPMENT_MODE = false;';
  let applied = false;

  return {
    name: 'release-bridge-flag',
    apply: 'build',
    transform(code, id) {
      const file = id.split(/[?#]/)[0].replace(/\\/g, '/');
      if (!file.endsWith('src/adapters/bridge/MpBridge.ts')) return null;
      if (code.includes(to)) {
        applied = true;
        return null;
      }
      if (!code.includes(from)) {
        this.error('IS_DEVELOPMENT_MODE not found: the release flag was not applied');
      }
      applied = true;
      console.log('release-bridge-flag: IS_DEVELOPMENT_MODE -> false');
      return { code: code.replace(from, to), map: null };
    },
    // A path rename would otherwise silently ship IS_DEVELOPMENT_MODE = true.
    generateBundle() {
      if (!applied) {
        this.error(
          'release-bridge-flag: src/adapters/bridge/MpBridge.ts was never transformed — ' +
            'the shipped bundle would start without the bridge gate (AGENTS.md §4.2)',
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // `--mode standalone` = a standalone web deployment (e.g. Vercel): no host
  // WebView injects `window.MpPostMessage`, so the bridge flag must stay `true`
  // for `waitForBridge()` to resolve immediately. Only the embedded WebView
  // build (default mode) flips it to `false`.
  const standalone = mode === 'standalone';

  return {
    base: './',
    plugins: standalone ? [] : [releaseBridgeFlag()],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      emptyOutDir: true,
      minify: 'terser',
      terserOptions: {
        compress: { passes: 2 },
        mangle: true,
        format: { comments: false },
      },
      rollupOptions: {
        output: {
          manualChunks: { phaser: ['phaser'] },
        },
      },
    },
    server: {
      port: 8080,
      host: true,
      open: false,
    },
  };
});
