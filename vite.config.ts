import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'fs';
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
        base: '/',
        plugins: [
            react(),
            tsconfigPaths(),
        ],
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return;
                        if (
                            id.includes('@mui') ||
                            id.includes('@emotion') ||
                            id.includes('react-dom') ||
                            id.includes('react-router') ||
                            id.includes('/react/')
                        ) {
                            return 'vendor-ui';
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