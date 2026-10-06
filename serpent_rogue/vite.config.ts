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

export default defineConfig({
  base: './',
  plugins: [releaseBridgeFlag()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
