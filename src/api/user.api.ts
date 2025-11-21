import { DEV_URL, USER_AUTH_URL, USER_INFO_URL, USERS_LIST_URL } from '@/api/base.api.ts';

export const APIPostAuth = async (initData: object, user: string)=> {
    return await fetch(USER_AUTH_URL, {
        method: 'POST',
        body: JSON.stringify({
            initData,
            user
        }),
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
        },
    });
}

export const APIGetUsers = async () => {
    return await fetch(DEV_URL + USERS_LIST_URL, {
        method: 'GET',
    })
}

export const APIGetUserInfo = async () => {
    return await fetch(DEV_URL + USER_INFO_URL, {
        method: 'GET',
    })
}
