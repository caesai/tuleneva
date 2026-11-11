/**
 * @file Общие правила анонимной статистики публичной страницы /music.
 * Клиент и сервер делят типы событий, окно дедупликации и метку источника.
 */

/** Цели счётчика. Те же идентификаторы создаются в Метрике как JavaScript-событие. */
export const MUSIC_EVENT_TYPES = ['play_start', 'play_complete', 'share'] as const;

/** Тип события прослушивания или шаринга. */
export type MusicEventType = (typeof MUSIC_EVENT_TYPES)[number];

/**
 * Повтор того же play_start, play_complete или share в одну сессию не пишется.
 * Для прослушивания ключ — запись, для шаринга — запись, альбом и плейлист вместе.
 */
export const MUSIC_EVENT_DEDUPE_MS = 30 * 60 * 1000;

/** Скользящее окно сводки в админке, в сутках. */
export const MUSIC_STATS_DAYS = 7 as const;

/** Сколько источников и записей показывать в сводке. */
export const MUSIC_STATS_TOP = 5;

/** Доля длительности, после которой слушание считается дослушанным. Конец записи тоже считается. */
export const MUSIC_COMPLETE_RATIO = 0.9;

/** Метка, которую «Поделиться» добавляет к ссылке как `from`. */
export const MUSIC_SHARE_SOURCE = 'share';

const SOURCE_PATTERN = /^[a-z0-9._~-]{1,64}$/;

/**
 * Оставляет короткую метку источника без пробелов и личных данных.
 * @param raw Значение `from`, `utm_source` или поля события
 * @returns Метка в нижнем регистре или null, если строку нельзя хранить
 */
export const sanitizeMusicSource = (raw: unknown): string | null => {
    if (typeof raw !== 'string') {
        return null;
    }
    const value = raw.trim().toLowerCase();
    if (!SOURCE_PATTERN.test(value)) {
        return null;
    }
    return value;
};
