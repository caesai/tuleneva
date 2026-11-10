import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingScreen } from '@/components/LandingScreen/LandingScreen.tsx';

vi.mock('@/hooks/usePageMeta.ts', () => ({
    usePageMeta: vi.fn(),
}));

describe('LandingScreen', () => {
    it('переключает соцсети по клику на логотип', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <LandingScreen />
            </MemoryRouter>,
        );

        const showButton = screen.getByRole('button', { name: 'Показать соцсети студии' });

        expect(screen.queryByRole('link', { name: 'Слушать' })).not.toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Соцсети студии' })).not.toBeInTheDocument();

        await user.click(showButton);

        expect(screen.getByRole('navigation', { name: 'Соцсети студии' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Telegram' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'ВКонтакте' })).toHaveAttribute('href', 'https://vk.com/tuleneva25');
        expect(screen.getByRole('link', { name: 'YouTube' })).toBeInTheDocument();

        expect(screen.getByRole('link', { name: 'Музыка' })).toHaveAttribute('href', '/music');

        await user.click(screen.getByRole('button', { name: 'Скрыть соцсети студии' }));

        expect(screen.queryByRole('navigation', { name: 'Соцсети студии' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Музыка' })).not.toBeInTheDocument();
    });
});
