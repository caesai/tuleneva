import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'fs';
import { indexHtmlMetaPlugin } from './vite-plugins/indexHtmlMetaPlugin.ts';
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
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
                // Proxy requests from your Vite server to your backend
                // Прод по IP: HTTP (порт 80) отдаёт 404 для /api — API проксируется только по HTTPS.
                '/api': {
                    target: 'https://51.250.16.74',
                    changeOrigin: true,
                    secure: false,
                },
                // WebSocket proxy for real-time updates
                '/ws': {
                    target: 'wss://51.250.16.74',
                    ws: true,
                    changeOrigin: true,
                    secure: false,
                },
            },
            https: command === 'build' ? {} : {
                key: fs.readFileSync('./.cert/localhost-key.pem'),
                cert: fs.readFileSync('./.cert/localhost.pem'),
            },
        },
    }),
);