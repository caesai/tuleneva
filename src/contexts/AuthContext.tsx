import React, { createContext, useState, useEffect, useContext, type ReactNode } from 'react';
import { APIGetAuth } from '@/api/user.api.ts';
import type { IUser } from '@/types/user.types.ts';

interface IAuthContext {
    isAuthenticated: boolean;
    login: (userData: IUser, token: string) => void;
    logout: () => void;
    user: IUser | null;
}

const AuthContext = createContext<IAuthContext | null>(null);

interface AuthContextProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthContextProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<IUser | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        if (token) {
            // Validate the token with the server
            APIGetAuth(token)
                .then(response => response.json())
                .then(data => {
                    if (data.valid) {
                        setIsAuthenticated(true);
                        setUser(data.user);
                    } else {
                        localStorage.removeItem('authToken');
                        setIsAuthenticated(false);
                        setUser(null);
                    }
                })
                .catch(() => {
                    localStorage.removeItem('authToken');
                    setIsAuthenticated(false);
                    setUser(null);
                });
        }
    }, []);

    const login = (userData: IUser, token: string) => {
        localStorage.setItem('authToken', token);
        setIsAuthenticated(true);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        setIsAuthenticated(false);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
