const path = require('path');
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        globals: true,
        environment: 'node',
        hookTimeout: 60000,
        testTimeout: 30000,
        include: ['test/**/*.test.ts'],
        setupFiles: ['./test/setup.ts'],
    },
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../shared'),
        },
    },
});
