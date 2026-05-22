/** Слот расписания; PII присутствует только для авторизованных участников (не guest). */
export interface IHour {
    hour: string;
    rehearsalType?: TRehearsalType;
    userId?: string;
    username?: string;
    band_name?: string;
    userPhotoUrl?: string;
}

export type TRehearsalType = 'rehearsal' | 'recording' | 'shooting';
