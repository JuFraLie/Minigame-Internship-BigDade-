import { defineConfig, type Plugin } from 'vite';

/**
 * `MpBridge.ts` ships with `IS_DEVELOPMENT_MODE = true` so `npm run dev` boots
 * in a plain browser (the host never injects `window.MpPostMessage` there).
 *
 * Two build flavours exist, and each one enforces the flag it needs:
 *
 *  - `npm run build` (WebView release): the flag must become `false`
 *    (AGENTS.md A4.2: no game code before the bridge exists).
 *  - `npm run build:standalone` (Vercel, no host): the flag must stay (or be
 *    set back to) `true`, otherwise `waitForBridge()` would poll for the
 *    host's `MpPostMessage`, time out, and refuse to boot the game at all.
 *
 * Either way the plugin fails the build loudly instead of shipping a bundle
 * that cannot start.
 */
function bridgeFlagPlugin(standalone: boolean): Plugin {
  const dev = 'export const IS_DEVELOPMENT_MODE = true;';
  const release = 'export const IS_DEVELOPMENT_MODE = false;';
  const from = standalone ? release : dev;
  const to = standalone ? dev : release;
  const name = standalone ? 'standalone-bridge-flag' : 'release-bridge-flag';
  let applied = false;

  return {
    name,
    apply: 'build',
    transform(code, id) {
      const file = id.split(/[?#]/)[0].replace(/\\/g, '/');
      if (!file.endsWith('src/adapters/bridge/MpBridge.ts')) return null;
      if (code.includes(to)) {
        applied = true;
        return null;
      }
      if (!code.includes(from)) {
        this.error(`${name}: IS_DEVELOPMENT_MODE not found: the ${standalone ? 'standalone' : 'release'} flag was not applied`);
      }
      applied = true;
      console.log(`${name}: IS_DEVELOPMENT_MODE -> ${standalone}`);
      return { code: code.replace(from, to), map: null };
    },
    // A path rename would otherwise silently ship the wrong flag.
    generateBundle() {
      if (!applied) {
        this.error(
          `${name}: src/adapters/bridge/MpBridge.ts was never transformed - ` +
            'the shipped bundle would have the wrong bridge gate (AGENTS.md A4.2)',
        );
      }
    },
  };
}

// `vite build --mode standalone` (see `build:standalone`) targets a plain
// browser with no host WebView, e.g. the game deployed as its own site.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [bridgeFlagPlugin(mode === 'standalone')],
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
}));
