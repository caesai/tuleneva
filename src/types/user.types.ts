export type TAuthProvider = 'telegram' | 'web' | 'email' | 'phone';

export interface IUserIdentity {
    provider: TAuthProvider;
    providerUserId: string;
    email?: string;
    phone?: string;
    verifiedAt?: string;
}

export interface IUser {
    _id?: string;
    telegram_id?: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    role: TRole;
    identities?: IUserIdentity[];
    createdAt?: string;
    updatedAt?: string;
    isRegistered?: boolean;
}

export type TRole = 'super_admin' | 'admin' | 'user' | 'guest';
