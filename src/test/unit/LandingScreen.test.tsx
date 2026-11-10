import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingScreen } from '@/components/LandingScreen/LandingScreen.tsx';

vi.mock('@/hooks/usePageMeta.ts', () => ({
    usePageMeta: vi.fn(),
}));

describe('LandingScreen', () => {
    it('держит ноту, ВК и YouTube на орбите без Telegram', () => {
        render(
            <MemoryRouter>
                <LandingScreen />
            </MemoryRouter>,
        );

        expect(screen.queryByRole('link', { name: 'Слушать' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Telegram' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Показать соцсети студии' })).not.toBeInTheDocument();

        expect(screen.getByRole('navigation', { name: 'Ссылки студии' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Музыка' })).toHaveAttribute('href', '/music');
        expect(screen.getByRole('link', { name: 'ВКонтакте' })).toHaveAttribute('href', 'https://vk.com/tuleneva25');
        expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/@tuleneva25');
    });
});
