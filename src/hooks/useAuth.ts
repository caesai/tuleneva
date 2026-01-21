import { AuthContext } from '@/contexts/AuthContextDefinition.ts';
import type { IAuthContext } from '@/contexts/AuthContextDefinition.ts';
import { useContext } from 'react';

/**
 * Хук для доступа к контексту аутентификации.
 * @returns {IAuthContext} Объект контекста, содержащий состояние аутентификации и методы login/logout.
 */
export const useAuth = (): IAuthContext => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
