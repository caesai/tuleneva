import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'fs';
import { indexHtmlMetaPlugin } from './vite-plugins/indexHtmlMetaPlugin.ts';
import { readApiProxy } from './vite-plugins/apiProxy.ts';
// https://vite.dev/config/
export default defineConfig(({ command }) => {
    const apiProxy = readApiProxy();
    return ({
        base: '/',
        plugins: [
            indexHtmlMetaPlugin(),
            react(),
            tsconfigPaths(),
        ],
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return;
                        // MUI не выносим в отдельный vendor: иначе цикл vendor-react ↔ vendor-mui
                        // (react-is и др.). MUI попадает в lazy-чанк TimeTablePage (/app).
                        if (id.includes('react-router')) return 'vendor-router';
                        if (
                            /node_modules\/(react|react-dom|scheduler|react-is|use-sync-external-store)(\/|$)/.test(
                                id,
                            )
                        ) {
                            return 'vendor-react';
                        }
                        if (id.includes('@telegram-apps')) return 'vendor-telegram';
                        if (id.includes('moment')) return 'vendor-moment';
                    },
                },
            },
        },
        server: {
            // Exposes your dev server and makes it accessible for the devices in the same network.
            port: 443,
            host: '0.0.0.0',
            hmr: {
                host: 'tuleneva.local',
                port: 443,
            },
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
            https: command === 'build' ? {} : {
                key: fs.readFileSync('./.cert/localhost-key.pem'),
                cert: fs.readFileSync('./.cert/localhost.pem'),
            },
        },
    });
});