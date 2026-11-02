import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Замороженный список legacy-маршрутов `/api/users/*` в app.ts.
 * Новый такой маршрут должен появляться только осознанно (и расширять этот список).
 */
const FROZEN_LEGACY_USERS_ROUTES = Object.freeze([
    'GET /api/users/info',
    'POST /api/users/register',
    'GET /api/users',
    'PUT /api/users/:id/role',
    'GET /api/users/:id/role-log',
    'PUT /api/users/:id/email-login',
    'DELETE /api/users/:id',
]);

/**
 * Извлекает объявленные в app.ts маршруты `/api/users…`.
 * @param source Текст app.ts
 * @returns Список строк вида "METHOD /api/users…"
 */
const extractUsersRoutes = (source: string): string[] => {
    const routes: string[] = [];
    const re = /app\.(get|post|put|delete|patch)\(\s*['`](\/api\/users[^'`]*)['`]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        routes.push(`${match[1].toUpperCase()} ${match[2]}`);
    }
    return routes;
};

describe('legacy /api/users routes freeze', () => {
    it('keeps the frozen set of /api/users routes in app.ts', () => {
        const appPath = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            '../../app.ts',
        );
        const source = fs.readFileSync(appPath, 'utf8');
        const found = extractUsersRoutes(source);
        expect(found).toEqual([...FROZEN_LEGACY_USERS_ROUTES]);
    });
});
