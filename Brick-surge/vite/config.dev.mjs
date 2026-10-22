import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080,
        // Bind to the LAN so a real phone on the same Wi-Fi can open the game
        // during development (host only sees localhost otherwise).
        host: true
    }
});
