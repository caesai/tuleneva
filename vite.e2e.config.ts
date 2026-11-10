/**
 * @file Vite для Playwright smoke: HTTP на :5173 без mkcert.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { indexHtmlMetaPlugin } from './vite-plugins/indexHtmlMetaPlugin.ts';
import { readApiProxy } from './vite-plugins/apiProxy.ts';

const apiProxy = readApiProxy();

export default defineConfig({
    base: '/',
    plugins: [indexHtmlMetaPlugin(), react(), tsconfigPaths()],
    server: {
        port: 5173,
        host: '127.0.0.1',
        proxy: {
            '/api': {
                target: apiProxy.http,
                changeOrigin: true,
                secure: apiProxy.secure,
            },
            '/ws': {
                target: apiProxy.ws,
                ws: true,
                changeOrigin: true,
                secure: apiProxy.secure,
            },
        },
    },
});
