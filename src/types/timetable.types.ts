export interface IHour {
    "hour": string;
    "userId": string;
    "username": string;
    "band_name": string;
    "userPhotoUrl": string;
    "rehearsalType": TRehearsalType;
}

export type TRehearsalType = 'rehearsal' | 'recording' | 'shooting';
