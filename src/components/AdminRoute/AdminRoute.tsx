import React, { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.ts';
import { SuspenseLoaderFallback } from '@/components/Loader/SuspenseLoaderFallback.tsx';

interface AdminRouteProps {
    children: ReactNode;
}

/**
 * Защищённый маршрут: рендерит children только для admin / super_admin.
 * Неавторизованных и остальных ролей перенаправляет на главную.
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { authStatus, capabilities } = useAuth();
    const location = useLocation();

    if (authStatus === 'loading') {
        return <SuspenseLoaderFallback fullScreen />;
    }

    if (!capabilities.isAdmin) {
        return <Navigate to="/" replace state={{ from: location.pathname }} />;
    }

    return <>{children}</>;
};
