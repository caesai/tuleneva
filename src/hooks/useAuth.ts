import { AuthContext } from '@/contexts/AuthContextDefinition.ts';
import { useContext } from 'react';

/**
 * Хук для доступа к контексту аутентификации.
 * @returns {IAuthContext} Объект контекста, содержащий состояние аутентификации и методы login/logout.
 */
export const useAuth = () => useContext(AuthContext);
