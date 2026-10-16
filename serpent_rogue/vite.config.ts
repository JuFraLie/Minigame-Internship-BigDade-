import { defineConfig, type Plugin } from 'vite';

function releaseBridgeFlag(): Plugin {
  const from = 'export const IS_DEVELOPMENT_MODE = true;';
  const to   = 'export const IS_DEVELOPMENT_MODE =false;';

  return {
    name: 'release-bridge-flag',
    apply: 'build',
    transform(code, id) {
      const file = id.split(/[?#]/)[0].replace(/\\/g, '/');
      if (!file.endsWith('src/services/MpBridge.ts')) return null;
      if (code.includes(to)) return null;
      if (!code.includes(from)) {
        this.error('IS_DEVELOPMENT_MODE not found: the release flag was not applied');
      }
      return { code: code.replace(from, to), map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  // A standalone web deployment (e.g. Vercel) runs in a plain browser where no
  // MPArcade WebView injects `window.MpPostMessage`. Leaving IS_DEVELOPMENT_MODE
  // = true there lets waitForBridge() resolve immediately so the game boots;
  // every webviewSignal* call no-ops via optional chaining. Only the embedded
  // WebView build (default mode) flips the flag to false.
  const standalone = mode === 'standalone';

  return {
    base: './',
    plugins: standalone ? [] : [releaseBridgeFlag()],
    build: {
      outDir: 'dist',
      target: 'es2020',
    },
  };
});
