import { defineConfig, type Plugin } from 'vite';

/**
 * Release flag for the host bridge (AGENTS.md §4.2).
 *
 * `src/services/jsbridge.ts` must stay byte-for-byte as the host module wrote
 * it, so `IS_DEVELOPMENT_MODE` is never edited by hand. The source keeps `true`
 * — a plain browser may run the game while developing — and this plugin flips
 * it to `false` while bundling, exactly what that file asks for:
 *
 *   "set this flag to false when it's time to release/bundle/build it for
 *    production … otherwise set this to true to allow the game to run on
 *    developer's browser"
 *
 * So `npm run dev` still starts without the WebView, while the shipped
 * `dist/` refuses to start until `window.MpPostMessage` exists.
 *
 * The replacement is the same length as the original, so no other character in
 * the file moves and no source map can drift.
 */
function releaseBridgeFlag(): Plugin {
  const from = 'export const IS_DEVELOPMENT_MODE = true;';
  const to = 'export const IS_DEVELOPMENT_MODE =false;';

  return {
    name: 'release-bridge-flag',
    apply: 'build',
    transform(code, id) {
      const file = id.split(/[?#]/)[0].replace(/\\/g, '/');
      if (!file.endsWith('src/services/jsbridge.ts')) return null;
      if (code.includes(to)) return null; // already in release mode
      if (!code.includes(from)) {
        this.error('IS_DEVELOPMENT_MODE not found: the release flag was not applied');
      }

      return { code: code.replace(from, to), map: null };
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [releaseBridgeFlag()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
