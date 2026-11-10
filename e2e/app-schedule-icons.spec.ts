/**
 * @file Расписание /app на iPhone: нет ссылки «Музыка»,
 * конверт и щит стоят столбиком и не накрывают стрелки месяца.
 */
import { devices, expect, test, type Page } from '@playwright/test';

const iphone = devices['iPhone 13'];

test.use({
    viewport: iphone.viewport,
    userAgent: iphone.userAgent,
    isMobile: iphone.isMobile,
    hasTouch: iphone.hasTouch,
    deviceScaleFactor: iphone.deviceScaleFactor,
});

const ADMIN_TOKEN = 'e30.e30.sig';

/**
 * Админ без боевого API: обе иконки видны, календарь получает пустой месяц.
 * @param page - Страница Playwright
 */
const openAdminSchedule = async (page: Page) => {
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
        if (path.startsWith('/api/timetable')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ result: [] }),
            });
            return;
        }
        if (path.startsWith('/api/hours')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ hours: [] }),
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{}',
        });
    });
    await page.goto('/app');
};

test('на расписании нет входа в музыку, иконки не накрывают стрелки', async ({ page }) => {
    await openAdminSchedule(page);

    await expect(page.getByRole('link', { name: 'Музыка' })).toHaveCount(0);

    const email = page.getByRole('button', { name: 'Вход в браузере' });
    const admin = page.getByRole('button', { name: 'Админ-панель' });
    const nextMonth = page.getByRole('button', { name: 'Следующий месяц' });
    await expect(email).toBeVisible({ timeout: 20_000 });
    await expect(admin).toBeVisible();
    await expect(nextMonth).toBeVisible();

    const emailBox = await email.boundingBox();
    const adminBox = await admin.boundingBox();
    const nextBox = await nextMonth.boundingBox();
    expect(emailBox).not.toBeNull();
    expect(adminBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    if (!emailBox || !adminBox || !nextBox) {
        return;
    }

    expect(emailBox.width).toBeGreaterThanOrEqual(44);
    expect(emailBox.height).toBeGreaterThanOrEqual(44);
    expect(adminBox.width).toBeGreaterThanOrEqual(44);
    expect(adminBox.height).toBeGreaterThanOrEqual(44);
    expect(emailBox.y + emailBox.height).toBeLessThanOrEqual(adminBox.y + 1);
    expect(Math.abs(emailBox.x - adminBox.x)).toBeLessThanOrEqual(2);
    expect(emailBox.y + emailBox.height).toBeLessThanOrEqual(nextBox.y + 1);
    expect(adminBox.y + adminBox.height).toBeLessThanOrEqual(nextBox.y + 1);

    await page.screenshot({
        path: '/opt/cursor/artifacts/app-schedule-after-iphone.png',
        fullPage: true,
    });
});
