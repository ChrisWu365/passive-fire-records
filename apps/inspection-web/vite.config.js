import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// One origin for the browser, two services behind it. Vite uses the first prefix that matches, so the
// register rule must come before the general /api rule.
var proxy = {
    '/api/register': 'http://localhost:8080',
    '/api': 'http://localhost:4000',
    '/health': 'http://localhost:4000',
    '/uploads': 'http://localhost:4000'
};
// SQLite's WebAssembly file is about 0.9 MB, above the service worker's default limit for cached files.
var MAX_CACHED_FILE_BYTES = 3 * 1024 * 1024;
export default defineConfig({
    plugins: [
        react(),
        // Makes the built app installable and able to open with no network: a service worker caches the app's
        // own files. It never caches API answers; offline data comes from the device database instead.
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.png', 'icon.svg'],
            manifest: {
                name: 'Passive Fire Inspection Workspace',
                short_name: 'Inspections',
                description: 'Record passive fire inspections on site, with or without a connection.',
                start_url: '/',
                display: 'standalone',
                background_color: '#102a36',
                theme_color: '#102a36',
                icons: [
                    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                    { src: 'favicon.png', sizes: '128x128', type: 'image/png' }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
                maximumFileSizeToCacheInBytes: MAX_CACHED_FILE_BYTES,
                // Any page address opens the cached app; requests to the services are never answered from cache.
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/health/, /^\/api-docs/],
                clientsClaim: true,
                skipWaiting: true,
                cleanupOutdatedCaches: true
            }
        })
    ],
    // The SQLite package locates its WebAssembly file relative to its own module, which pre-bundling breaks.
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    worker: { format: 'es' },
    server: { port: 5173, proxy: proxy },
    // "vite preview" serves the built app for the offline end-to-end tests, behind the same routing.
    preview: { port: 4173, proxy: proxy },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        css: true
    }
});
