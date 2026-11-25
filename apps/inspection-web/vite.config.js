import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // One origin for the browser, two services behind it. Vite uses the first prefix that matches, so the
        // register rule must come before the general /api rule.
        proxy: {
            '/api/register': 'http://localhost:8080',
            '/api': 'http://localhost:4000',
            '/health': 'http://localhost:4000',
            '/uploads': 'http://localhost:4000'
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        css: true
    }
});
