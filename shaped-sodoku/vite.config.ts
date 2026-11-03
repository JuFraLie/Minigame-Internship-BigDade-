import { defineConfig, type Plugin } from 'vite';

const BRIDGE_MODULE = 'src/bridge/MpBridge.ts';
const DEV_FLAG = 'export const IS_DEVELOPMENT_MODE = true;';
const RELEASE_FLAG = 'export const IS_DEVELOPMENT_MODE = false;';

/**
 * The bridge module must keep `IS_DEVELOPMENT_MODE = true` in source so the game can be
 * opened straight in a browser during development. Production builds must not skip the
 * real bridge handshake, so the flag is rewritten to `false` here — and the build fails
 * loudly if the rewrite ever silently stops matching.
 */
function releaseBridgeFlag(): Plugin {
    let applied = false;

    return {
        name: 'release-bridge-flag',
        apply: 'build',
        transform(code, id) {
            const file = id.split(/[?#]/)[0].replace(/\\/g, '/');
            if (!file.endsWith(BRIDGE_MODULE)) return null;

            if (code.includes(RELEASE_FLAG)) {
                applied = true;
                return null;
            }
            if (!code.includes(DEV_FLAG)) {
                this.error(`IS_DEVELOPMENT_MODE not found in ${BRIDGE_MODULE}; the release flag was not applied`);
            }
            applied = true;
            return { code: code.replace(DEV_FLAG, RELEASE_FLAG), map: null };
        },
        generateBundle() {
            if (!applied) {
                this.error(`IS_DEVELOPMENT_MODE was never rewritten; ${BRIDGE_MODULE} was not part of the bundle`);
            }
        },
    };
}

export default defineConfig({
    base: './',
    plugins: [releaseBridgeFlag()],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        emptyOutDir: true,
        minify: 'terser',
        target: 'es2020',
        terserOptions: {
            compress: { passes: 2 },
            mangle: true,
            format: { comments: false },
        },
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser'],
                },
            },
        },
    },
    server: {
        port: 8080,
        host: true,
        open: false,
    },
});
