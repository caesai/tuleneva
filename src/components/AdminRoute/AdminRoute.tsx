import React, { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.ts';
import { Loader } from '@/components/Loader/Loader.tsx';

interface AdminRouteProps {
    children: ReactNode;
}

/**
 * Защищённый маршрут: рендерит children только для admin / super_admin
 * с уже установленной сессией. Пока auth ещё читает токен или ждёт init data,
 * сразу показывает логотип и не уводит на главную.
 * Неавторизованных и остальных ролей перенаправляет на главную.
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { authStatus, capabilities } = useAuth();
    const location = useLocation();

    if (authStatus === 'loading') {
        return <Loader fullScreen />;
    }

    if (!capabilities.isAdmin) {
        return <Navigate to="/" replace state={{ from: location.pathname }} />;
    }

    return <>{children}</>;
};
