/**
 * @file Главная: нота на орбите ведёт на /music.
 * Текстовой ссылки «Слушать» на главной нет.
 * На публичной музыке нет ссылки в приложение расписания.
 */
import { test, expect } from '@playwright/test';

test('music note on the home orbit opens /music', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Слушать' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Telegram' })).toHaveCount(0);
    const note = page.getByRole('link', { name: 'Музыка' });
    await expect(note).toBeVisible();
    await note.click();

    await expect(page).toHaveURL(/\/music$/);
    await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Расписание' })).toHaveCount(0);
});
