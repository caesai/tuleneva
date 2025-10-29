import { BOOK_URL, CANCEL_URL, DEV_URL, HOURS_URL, TIMETABLE_URL } from './base.api.ts';

export const APIGetTimeTable = async (date: string) => {
    const url = new URL(`${DEV_URL + TIMETABLE_URL}`);
    url.search = new URLSearchParams({
        date
    }).toString();
    return await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
        },
    });
};

export const APIGetHours = async (date: string): Promise<Response> => {
    const url = new URL(`${DEV_URL + HOURS_URL}`);
    url.search = new URLSearchParams({
        date
    }).toString();
    return await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
        },
    });
};

export const APIPostBookRehearsal = async (date: string, hours: string[], username: string, band_name?: string) => {
    return await fetch(DEV_URL + BOOK_URL, {
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

export const APICancelBooking = async (date: string, hours: string[], userId: string) => {
    const response = await fetch(DEV_URL + CANCEL_URL, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            date, // e.g., '29/10/2025'
            hours, // e.g., ['10:00', '11:00']
            userId
        }),
    });

    if (response.status === 404) {
        throw new Error('Booking not found or already canceled.');
    }
    if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
    }

    return await response.json();
};
