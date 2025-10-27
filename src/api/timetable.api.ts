import { BASE_URL, BOOK_URL, BOOKINGS_URL, HOURS_URL } from './base.api.ts';

export const APIPostTimeTable = async (date: string) => {
    return await fetch(BASE_URL + BOOKINGS_URL, {
        method: 'POST',
        body: JSON.stringify({ date }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
};

export const APIPostBookedHours = async (date: string) => {
    return await fetch(BASE_URL + HOURS_URL, {
        method: 'POST',
        body: JSON.stringify({
            date,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
};

export const APIPostBookRehearsal = async (date: string, hours: string[], username: string, band_name?: string) => {
    return await fetch(BASE_URL + BOOK_URL, {
        method: 'POST',
        body: JSON.stringify({
            date,
            hours,
            username,
            band_name,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
};
