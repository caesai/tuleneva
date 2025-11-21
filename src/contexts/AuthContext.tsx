import React, { createContext, useState, useEffect, useContext, type ReactNode } from 'react';
import { APIPostAuth } from '@/api/user.api.ts';
import type { IUser } from '@/types/user.types.ts';
import {useLaunchParams, useRawInitData} from '@telegram-apps/sdk-react';

interface IAuthContext {
    isAuthenticated: boolean;
    login: (userData: IUser, token: string) => void;
    logout: () => void;
    user: IUser | null;
}

const initialAuthState: IAuthContext = {
    isAuthenticated: false,
    login: () => {},
    logout: () => {},
    user: null
}

const AuthContext = createContext<IAuthContext>(initialAuthState);

interface AuthContextProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthContextProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<IUser | null>(null);
    const lp = useLaunchParams();
    const rawLp = useRawInitData();
    console.log('user: ', user);
    useEffect(() => {
        // const token = localStorage.getItem('authToken');
        if (lp && rawLp) {
            // Validate the token with the server
            APIPostAuth(lp, rawLp)
                .then(response => response.json())
                .then(data => {
                    if (data.valid) {
                        login(data.user, data.token);
                    } else {
                        logout();
                    }
                })
                .catch(() => {
                    logout();
                });
        }
    }, [lp, rawLp]);

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
