/**
 * @file Вперёд — в начало страницы, назад — на сохранённую прокрутку.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ScrollToTop } from '@/navigation/ScrollToTop.tsx';

const Page: React.FC<{ name: string }> = ({ name }) => {
    const navigate = useNavigate();
    return (
        <main>
            <h1>{name}</h1>
            <Link to="/music">К музыке</Link>
            <button type="button" onClick={() => navigate(-1)}>Назад</button>
        </main>
    );
};

describe('ScrollToTop', () => {
    it('открывает новый маршрут сверху и возвращает прокрутку по кнопке назад', async () => {
        let y = 120;
        vi.spyOn(window, 'scrollTo').mockImplementation((_x, top) => {
            y = Number(top);
        });
        Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/']}>
                <ScrollToTop />
                <Routes>
                    <Route path="/" element={<Page name="Главная" />} />
                    <Route path="/music" element={<Page name="Музыка" />} />
                </Routes>
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Главная' })).toBeInTheDocument();
        y = 120;

        await user.click(screen.getByRole('link', { name: 'К музыке' }));
        expect(await screen.findByRole('heading', { name: 'Музыка' })).toBeInTheDocument();
        expect(y).toBe(0);

        y = 240;
        await user.click(screen.getByRole('button', { name: 'Назад' }));
        expect(await screen.findByRole('heading', { name: 'Главная' })).toBeInTheDocument();
        expect(y).toBe(120);
    });
});
