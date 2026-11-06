/**
 * @file Пределы первой версии: один MP3 и необязательная обложка.
 */

/** @description Верхняя граница MP3. */
export const AUDIO_MAX_BYTES = 30 * 1024 * 1024;

/** @description Верхняя граница обложки. */
export const COVER_MAX_BYTES = 2 * 1024 * 1024;

/** @description Длина названия. */
export const TITLE_MAX = 120;

/** @description Длина строки «кто играет». */
export const CREDITS_MAX = 160;

/** @description Длина короткого описания. */
export const DESCRIPTION_MAX = 500;
