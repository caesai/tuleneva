import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Границы слоёв и lint для клиента (src) и сервера (server).
 * TimeTablePage временно может импортировать @/telegram — исключение до выноса в capabilities/auth.
 */
export default defineConfig([
  globalIgnores(['dist', 'server/dist', 'server/node_modules', 'node_modules']),
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'vite-plugins/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '@/../server/**'],
              message: 'Клиент не импортирует server/. Общий код — в shared/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@telegram-apps/sdk-react',
              message:
                'SDK Telegram только в init/telegram/auth/AuthContext. В UI — useAuth().capabilities.',
            },
          ],
          patterns: [
            {
              group: ['**/server/**', '@/../server/**'],
              message: 'Клиент не импортирует server/. Общий код — в shared/.',
            },
            {
              group: ['@/telegram/**', '**/telegram/**'],
              message:
                'Страницы и компоненты не импортируют src/telegram/. Используйте useAuth / auth helpers.',
            },
          ],
        },
      ],
    },
  },
  {
    // Исключение: TimeTablePage ещё читает launch params напрямую.
    files: ['src/pages/TimeTablePage/TimeTablePage.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@telegram-apps/sdk-react',
              message:
                'SDK Telegram только в init/telegram/auth/AuthContext. В UI — useAuth().capabilities.',
            },
          ],
          patterns: [
            {
              group: ['**/server/**', '@/../server/**'],
              message: 'Клиент не импортирует server/. Общий код — в shared/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/**', '../src/**', '../../src/**'],
              message: 'Сервер не импортирует src/. Общий код — в shared/.',
            },
          ],
        },
      ],
    },
  },
])
