/**
 * @file Конфигурация Vitest для клиентских тестов.
 *
 * - jsdom-окружение и `globals: true` для совместимости с `describe/it/expect`
 *   без явного импорта;
 * - `@vitejs/plugin-react` для автоматического JSX-трансформа в тестах
 *   (без него падает `ReferenceError: React is not defined`);
 * - alias `@` → `./src` задан явно, потому что корневой `tsconfig.json`
 *   содержит только `references` и `vite-tsconfig-paths` не подхватывает
 *   `paths` из `tsconfig.app.json`;
 * - тесты исключены из production-сборки (`tsc -b`) через `exclude`
 *   в `tsconfig.app.json`, поэтому здесь они собираются отдельно.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
