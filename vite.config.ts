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
                '/api': {
                    target: 'http://localhost:3000',
                    changeOrigin: true,
                    secure: false, // For local development with self-signed certs
                },
            },
            https: command === 'build' ? {} : {
                key: fs.readFileSync('./.cert/localhost-key.pem'),
                cert: fs.readFileSync('./.cert/localhost.pem'),
            },
        },
    }),
);