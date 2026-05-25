/**
 * @file Тесты {@link AdminRoute}.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './AdminRoute.tsx';

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth.ts', () => ({
    useAuth: () => mockUseAuth(),
}));

describe('AdminRoute', () => {
    beforeEach(() => {
        mockUseAuth.mockReset();
    });

    it('редиректит гостя (не admin) на главную', () => {
        mockUseAuth.mockReturnValue({
            authStatus: 'authenticated',
            capabilities: { isAdmin: false },
        });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route
                        path="/admin"
                        element={
                            <AdminRoute>
                                <div>Secret admin</div>
                            </AdminRoute>
                        }
                    />
                    <Route path="/" element={<div>Home</div>} />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Secret admin')).not.toBeInTheDocument();
    });

    it('показывает children для admin', () => {
        mockUseAuth.mockReturnValue({
            authStatus: 'authenticated',
            capabilities: { isAdmin: true },
        });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route
                        path="/admin"
                        element={
                            <AdminRoute>
                                <div>Secret admin</div>
                            </AdminRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText('Secret admin')).toBeInTheDocument();
    });

    it('не рендерит admin-контент пока authStatus loading', () => {
        mockUseAuth.mockReturnValue({
            authStatus: 'loading',
            capabilities: { isAdmin: false },
        });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <Routes>
                    <Route
                        path="/admin"
                        element={
                            <AdminRoute>
                                <div>Secret admin</div>
                            </AdminRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.queryByText('Secret admin')).not.toBeInTheDocument();
    });
});
