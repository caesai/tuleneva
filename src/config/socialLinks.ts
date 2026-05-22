/**
 * @file Ссылки на соцсети студии «Тюленева 25» для лендинга.
 */

export type TSocialNetworkId = 'telegram' | 'vk' | 'youtube' | 'rutube';

export interface ISocialLink {
    id: TSocialNetworkId;
    href: string;
    label: string;
}

/**
 * Публичные профили студии (иконки на главной странице).
 */
export const SOCIAL_LINKS: readonly ISocialLink[] = [
    {
        id: 'telegram',
        href: 'https://t.me/tuleneva25_bot',
        label: 'Telegram',
    },
    {
        id: 'vk',
        href: 'https://vk.com/tuleneva25',
        label: 'ВКонтакте',
    },
    {
        id: 'youtube',
        href: 'https://www.youtube.com/@tuleneva25',
        label: 'YouTube',
    },
    // {
    //     id: 'rutube',
    //     href: 'https://rutube.ru/channel/23925903/',
    //     label: 'Rutube',
    // },
] as const;
