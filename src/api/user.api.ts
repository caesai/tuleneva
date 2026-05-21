import { DEV_URL, USERS_LIST_URL, getAuthHeaders } from '@/api/base.api.ts';

/**
 * @deprecated Используйте loginWithTelegram из auth.api.ts
 */
export { loginWithTelegram as APIPostAuth } from '@/api/auth.api.ts';

/**
 * @deprecated Используйте requestAccessWithTelegram из auth.api.ts
 */
export { requestAccessWithTelegram as APIRegisterUser } from '@/api/auth.api.ts';

/**
 * @deprecated Используйте applyInviteWithProvider из auth.api.ts
 */
export { applyInviteWithProvider as APIUseInvite } from '@/api/auth.api.ts';

/**
 * Получает список всех пользователей (только для админов).
 */
export const APIGetUsers = async () => {
    return await fetch(DEV_URL + USERS_LIST_URL, {
        method: 'GET',
        headers: getAuthHeaders(),
    });
};

export const APIUpdateUserRole = async (userId: string, role: string) => {
    return await fetch(`${DEV_URL + USERS_LIST_URL}/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
        headers: getAuthHeaders(),
    });
};

export const APIDeleteUser = async (userId: string) => {
    return await fetch(`${DEV_URL + USERS_LIST_URL}/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });
};

/** @deprecated Используйте getAuthSession из auth.api.ts */
export { getAuthSession as APIGetUserInfo } from '@/api/auth.api.ts';

export const APIGenerateInvite = async (options?: {
    purpose?: string;
    initialRole?: string;
    allowedProviders?: string[];
}) => {
    return await fetch(DEV_URL + '/auth/invite/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(options ?? {}),
    });
};

export const APIValidateInvite = async (code: string) => {
    return await fetch(`${DEV_URL}/auth/invite/validate/${code}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
        },
    });
};
