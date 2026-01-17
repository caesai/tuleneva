import { createContext } from 'react';
import type { IUser } from '@/types/user.types.ts';

/**
 * Интерфейс контекста аутентификации.
 */
export interface IAuthContext {
    /** Флаг, указывающий, аутентифицирован ли пользователь. */
    isAuthenticated: boolean;
    /** Флаг, указывающий, идет ли процесс проверки аутентификации. */
    isLoading: boolean;
    /** Функция для входа в систему (сохранение токена и данных пользователя). */
    login: (userData: IUser, token: string) => void;
    /** Функция для выхода из системы (удаление токена и сброс состояния). */
    logout: () => void;
    /** Функция для регистрации нового пользователя (запрос доступа). */
    register: () => Promise<void>;
    /** Объект текущего пользователя или null. */
    user: IUser | null;
}

/**
 * Начальное состояние контекста аутентификации.
 */
export const initialAuthState: IAuthContext = {
    isAuthenticated: false,
    isLoading: true,
    login: () => {},
    logout: () => {},
    register: async () => {},
    user: null
};

/**
 * React Context для аутентификации.
 * Создан в отдельном файле для поддержки Fast Refresh.
 */
export const AuthContext = createContext<IAuthContext>(initialAuthState);
