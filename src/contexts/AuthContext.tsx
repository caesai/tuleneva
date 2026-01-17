import React, { useState, useEffect, type ReactNode } from 'react';
import { APIPostAuth, APIRegisterUser } from '@/api/user.api.ts';
import type { IUser } from '@/types/user.types.ts';
import { useLaunchParams, useRawInitData } from '@telegram-apps/sdk-react';
import { AuthContext } from './AuthContextDefinition.ts';

interface AuthContextProps {
    children: ReactNode;
}

/**
 * Провайдер контекста аутентификации.
 * Управляет состоянием входа пользователя, проверяет данные запуска Telegram Mini App
 * и выполняет аутентификацию на сервере.
 *
 * @component
 */
export const AuthProvider: React.FC<AuthContextProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<IUser | null>(null);
    const lp = useLaunchParams();
    const rawLp = useRawInitData();

    useEffect(() => {
        const initAuth = async () => {
            setIsLoading(true);
            if (lp && rawLp) {
                try {
                    // Validate the token with the server
                    const response = await APIPostAuth(lp, rawLp);
                    const data = await response.json();

                    if (data.valid) {
                        console.log('Auth successful', data);
                        // Если токена нет, значит это незарегистрированный гость
                        login(data.user, data.token);
                    } else {
                        logout();
                    }
                } catch (error) {
                    console.error('Auth failed', error);
                    logout();
                } finally {
                    setIsLoading(false);
                }
            } else {
                // Если нет данных запуска (например, вне Telegram), считаем что не авторизован
                setIsLoading(false);
            }
        };

        initAuth();
    }, [lp, rawLp]);

    const login = (userData: IUser, token: string | null) => {
        if (token) {
            localStorage.setItem('authToken', token);
            setIsAuthenticated(true);
        } else {
            // Для незарегистрированных пользователей токена нет
            setIsAuthenticated(false);
        }
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        setIsAuthenticated(false);
        setUser(null);
    };

    const register = async () => {
        if (lp && rawLp) {
            try {
                const response = await APIRegisterUser(lp, rawLp);
                const data = await response.json();
                if (data.valid) {
                    login(data.user, data.token);
                }
            } catch (error) {
                console.error('Registration failed', error);
                throw error;
            }
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, register }}>
            {children}
        </AuthContext.Provider>
    );
};
