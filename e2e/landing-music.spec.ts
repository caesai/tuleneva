/**
 * @file Главная: нота по нажатию на логотип ведёт на /music.
 * На публичной музыке нет ссылки в приложение расписания.
 */
import { test, expect } from '@playwright/test';

test('logo tap shows a music note and music page has no app link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Музыка' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Показать соцсети студии' }).click();

    const note = page.getByRole('link', { name: 'Музыка' });
    await expect(note).toBeVisible();
    await note.click();

    await expect(page).toHaveURL(/\/music$/);
    await expect(page.getByRole('heading', { name: 'Музыка' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Расписание' })).toHaveCount(0);
});
