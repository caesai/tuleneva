/**
 * @file Холодный старт Mini App на iPhone: /admin с initData и без,
 * битый ленивый чанк и отсутствующий входной модуль.
 */
import { devices, expect, test } from '@playwright/test';

const iphone = devices['iPhone 13'];

test.use({
    viewport: iphone.viewport,
    userAgent: iphone.userAgent,
    isMobile: iphone.isMobile,
    hasTouch: iphone.hasTouch,
    deviceScaleFactor: iphone.deviceScaleFactor,
});

const telegramHash = [
    `tgWebAppData=${encodeURIComponent('query_id=AA&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22A%22%7D&auth_date=1&hash=abc')}`,
    'tgWebAppVersion=7.10',
    'tgWebAppPlatform=ios',
    'tgWebAppStartParam=admin',
].join('&');

const landingLogo = (page: import('@playwright/test').Page) => page.getByRole('button', {
    name: 'Показать соцсети студии',
});

test('admin без initData не остаётся белым', async ({ page }) => {
    await page.goto('/admin');
    await expect(landingLogo(page)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
        path: '/opt/cursor/artifacts/admin-cold-start-iphone.png',
        fullPage: true,
    });
});

test('admin с tgWebAppData в hash всё равно рисуется', async ({ page }) => {
    await page.goto(`/admin#${telegramHash}`);
    await expect(landingLogo(page)).toBeVisible({ timeout: 20_000 });
});

const ADMIN_TOKEN = 'e30.e30.sig';

/**
 * Сессия администратора без боевого API: чанк /admin грузится только для admin.
 * @param page - Страница Playwright
 */
const signInAsAdmin = async (page: import('@playwright/test').Page) => {
    await page.addInitScript((token) => {
        localStorage.setItem('authToken', token);
    }, ADMIN_TOKEN);
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/session') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: true,
                    token: ADMIN_TOKEN,
                    authProvider: 'web',
                    user: {
                        _id: 'admin1',
                        first_name: 'Admin',
                        role: 'super_admin',
                    },
                }),
            });
            return;
        }
        if (path === '/api/auth/invite/history') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ live: [], history: [] }),
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
        });
    });
};

test('битый чанк админки один раз перезагружает и открывает приложение', async ({ page }) => {
    await signInAsAdmin(page);
    let htmlResponses = 0;
    await page.route(/AdminPage\.tsx/, async (route) => {
        if (htmlResponses === 0) {
            htmlResponses += 1;
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: '<!doctype html><html><body>stale index</body></html>',
            });
            return;
        }
        await route.continue();
    });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Управление пользователями' })).toBeVisible({
        timeout: 20_000,
    });
    expect(htmlResponses).toBe(1);
});

test('нет входного модуля — лоадер сменяется кнопкой «Обновить»', async ({ page }) => {
    await page.addInitScript(() => {
        sessionStorage.setItem('tuleneva:chunk-reload', '1');
    });
    await page.route('**/src/main.tsx*', (route) => route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'missing',
    }));

    await page.goto('/admin');
    await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible();
    await expect(page.getByText('Не удалось открыть приложение.')).toBeVisible();
    await page.screenshot({
        path: '/opt/cursor/artifacts/admin-chunk-error-iphone.png',
        fullPage: true,
    });
});
