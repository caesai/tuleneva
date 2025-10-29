export interface IUser {
    id: number;
    telegram_id: number;
    first_name: string;
    last_name: string;
    username: string;
    photo_url: string;
    role: TRole;
}

type TRole = 'admin' | 'user' | 'guest';
