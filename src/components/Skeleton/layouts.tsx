import type { FC } from 'react';
import { Bone } from './Bone';
import css from './skeleton.module.css';

/**
 * @file Макеты скелетов. Размеры повторяют живые блоки: календарь, слоты 44px, ряды, обложки 1:1.
 */

const days = Array.from({ length: 35 }, (_, index) => index);
const slots = Array.from({ length: 12 }, (_, index) => index);
const rows = Array.from({ length: 4 }, (_, index) => index);

/**
 * Сетка месяца и слотов на странице записи.
 */
export const CalendarSkeleton: FC = () => (
    <div className={css.stack} aria-hidden="true">
        <Bone height={36} width="60%" />
        <div className={css.week}>
            {Array.from({ length: 7 }, (_, index) => (
                <Bone key={index} height={12} width={18} radius={4} />
            ))}
        </div>
        <div className={css.days}>
            {days.map((index) => (
                <Bone key={index} className={css.day} height={36} circle />
            ))}
        </div>
        <SlotsSkeleton />
    </div>
);

/**
 * Ряд свободных часов: три колонки, высота кнопки 44.
 */
export const SlotsSkeleton: FC = () => (
    <div className={css.slots} aria-hidden="true">
        {slots.map((index) => (
            <Bone key={index} height={44} />
        ))}
    </div>
);

/**
 * Карточка пользователя: аватар 40, две строки, кнопка действий 44.
 */
export const UsersSkeleton: FC = () => (
    <div className={css.stack} aria-hidden="true">
        {rows.map((index) => (
            <div key={index} className={css.row}>
                <Bone height={40} circle />
                <div className={css.lines}>
                    <Bone height={16} width="70%" />
                    <Bone height={12} width="40%" />
                </div>
                <Bone height={44} circle />
            </div>
        ))}
    </div>
);

/**
 * Админская библиотека: сводка, сегмент Треки/Альбомы/Плейлисты и строка с кнопками 44.
 */
export const LibrarySkeleton: FC = () => (
    <div className={css.stack} aria-hidden="true">
        <div className={css.summary}>
            <Bone height={16} width="36%" />
            <Bone height={14} width="92%" />
            <Bone height={12} width="70%" />
        </div>
        <div className={css.segment}>
            <Bone height={44} />
            <Bone height={44} />
            <Bone height={44} />
        </div>
        {rows.slice(0, 3).map((index) => (
            <div key={index} className={css.libraryRow}>
                <Bone height={44} width={44} />
                <div className={css.lines}>
                    <Bone height={16} width="46%" />
                    <Bone height={12} width="72%" />
                </div>
                <div className={css.actionRow}>
                    <Bone height={44} circle />
                    <Bone height={44} circle />
                    <Bone height={44} circle />
                    <Bone height={44} circle />
                </div>
            </div>
        ))}
    </div>
);

/**
 * Каталог /music: сетка квадратных обложек, как у живых карточек.
 */
export const CatalogSkeleton: FC = () => (
    <div className={css.covers} aria-hidden="true">
        <Bone className={css.square} height={160} />
        <Bone className={css.square} height={160} />
    </div>
);

/**
 * Страница альбома или плейлиста: герой 1:1 и строки.
 */
export const CollectionSkeleton: FC = () => (
    <div className={css.stack} aria-hidden="true">
        <Bone className={css.square} height={280} />
        <Bone height={12} width="30%" />
        <Bone height={28} width="55%" />
        {rows.slice(0, 2).map((index) => (
            <div key={index} className={css.row}>
                <Bone height={44} />
                <div className={css.lines}>
                    <Bone height={16} width="60%" />
                    <Bone height={12} width="40%" />
                </div>
                <Bone height={44} circle />
            </div>
        ))}
    </div>
);

/**
 * Страница одной записи: заголовок и карточка плеера.
 */
export const TrackPageSkeleton: FC = () => (
    <div className={css.stack} aria-hidden="true">
        <Bone height={28} width="55%" />
        <PlayerSkeleton />
    </div>
);

/**
 * Карточка плеера: обложка 56 и строка управления.
 */
export const PlayerSkeleton: FC = () => (
    <div className={css.player} aria-hidden="true">
        <Bone height={56} />
        <div className={css.lines}>
            <Bone height={16} width="70%" />
            <Bone height={12} width="40%" />
            <Bone height={44} width="100%" />
        </div>
    </div>
);

/**
 * Запасной экран для ленивого маршрута: шапка и несколько строк.
 */
export const RouteSkeleton: FC = () => (
    <div className={css.route} aria-busy="true" aria-label="Загрузка страницы">
        <div className={css.bar}>
            <Bone height={44} circle />
            <Bone height={18} width="40%" />
        </div>
        <Bone height={28} width="50%" />
        <Bone height={14} width="90%" />
        <Bone height={14} width="75%" />
        <Bone height={120} />
    </div>
);
