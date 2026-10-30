/**
 * @file Vite для Playwright smoke: HTTP на :5173 без mkcert.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { indexHtmlMetaPlugin } from './vite-plugins/indexHtmlMetaPlugin.ts';

export default defineConfig({
    base: '/',
    plugins: [indexHtmlMetaPlugin(), react(), tsconfigPaths()],
    server: {
        port: 5173,
        host: '127.0.0.1',
        proxy: {
            '/api': {
                target: 'https://51.250.16.74',
                changeOrigin: true,
                secure: false,
            },
            '/ws': {
                target: 'wss://51.250.16.74',
                ws: true,
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
