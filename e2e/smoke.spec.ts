/**
 * @file Smoke: расписание и модалка входа по почте (без Telegram).
 */
import { test, expect } from '@playwright/test';

test.describe('email login smoke', () => {
    test('opens timetable and email login modal', async ({ page }) => {
        await page.goto('/app');

        const loginButton = page.getByRole('button', { name: 'Войти по почте' });
        await expect(loginButton).toBeVisible({ timeout: 30_000 });

        await loginButton.click();

        await expect(page.getByRole('heading', { name: 'Вход по почте' })).toBeVisible();
        await expect(page.getByLabel('Почта')).toBeVisible();
        await expect(page.getByLabel('Пароль')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Забыли пароль?' })).toBeVisible();
    });

    test('forgot password mode from login modal', async ({ page }) => {
        await page.goto('/app');

        await page.getByRole('button', { name: 'Войти по почте' }).click();
        await page.getByRole('button', { name: 'Забыли пароль?' }).click();

        await expect(page.getByRole('heading', { name: 'Сброс пароля' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Отправить ссылку' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Назад ко входу' })).toBeVisible();
    });
});
