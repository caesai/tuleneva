/**
 * @file Расписание /app на iPhone: календарь по центру на прежней ширине,
 * иконки — плавающая колонка справа снизу, не на стрелках и слотах.
 */
import { devices, expect, test, type Page } from '@playwright/test';

const iphone = devices['iPhone 13'];

test.use({
    /* Высота экрана iPhone 13, без панели Safari: в Mini App её нет. */
    viewport: { width: iphone.viewport.width, height: 844 },
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
    expect(overlaps(emailBox, nextBox)).toBe(false);
    expect(overlaps(adminBox, nextBox)).toBe(false);

    const calendar = page.getByRole('grid', { name: /2026/ });
    const calendarBox = await calendar.boundingBox();
    const viewport = page.viewportSize();
    expect(calendarBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (calendarBox && viewport) {
        const center = calendarBox.x + calendarBox.width / 2;
        expect(Math.abs(center - viewport.width / 2)).toBeLessThan(12);
        expect(calendarBox.width).toBeGreaterThanOrEqual(300);
        expect(calendarBox.width).toBeLessThanOrEqual(340);
    }

    const slots = page.getByRole('button', { name: /^Слот / });
    const slotCount = await slots.count();
    expect(slotCount).toBeGreaterThan(0);
    for (let index = 0; index < slotCount; index += 1) {
        const slotBox = await slots.nth(index).boundingBox();
        if (!slotBox) {
            continue;
        }
        expect(overlaps(emailBox, slotBox)).toBe(false);
        expect(overlaps(adminBox, slotBox)).toBe(false);
    }

    const emailStyle = await email.evaluate((node) => getComputedStyle(node.parentElement!).position);
    expect(emailStyle).toBe('fixed');

    await page.screenshot({
        path: '/opt/cursor/artifacts/app-schedule-pill-iphone.png',
        fullPage: false,
    });

    await page.evaluate(() => {
        document.body.style.minHeight = '2000px';
        window.scrollTo(0, 500);
    });
    const emailAfterScroll = await email.boundingBox();
    expect(emailAfterScroll).not.toBeNull();
    if (emailAfterScroll) {
        expect(Math.abs(emailAfterScroll.y - emailBox.y)).toBeLessThan(2);
        expect(Math.abs(emailAfterScroll.x - emailBox.x)).toBeLessThan(2);
    }
    await page.screenshot({
        path: '/opt/cursor/artifacts/app-schedule-pill-scrolled-iphone.png',
        fullPage: false,
    });
});

/**
 * Прямоугольники пересекаются.
 * @param a - Первый бокс
 * @param b - Второй бокс
 * @returns true, если области наезжают друг на друга
 */
const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): boolean => a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
