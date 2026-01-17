export interface IUser {
    _id?: string;
    telegram_id: number;
    first_name: string;
    last_name: string;
    username: string;
    photo_url: string;
    role: TRole;
    createdAt?: string;
    updatedAt?: string;
    isRegistered?: boolean;
}

export type TRole = 'admin' | 'user' | 'guest';
