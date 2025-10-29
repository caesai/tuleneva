import { DEV_URL, USER_INFO_URL, USERS_LIST_URL } from '@/api/base.api.ts';

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
