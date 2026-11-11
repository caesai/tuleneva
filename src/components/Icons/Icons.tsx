/**
 * @file Линейные значки одного веса: обводка 1.75, цвет currentColor.
 * Play и pause — заливка, они живут только внутри чёрного круга.
 */
import React from 'react';

interface IconProps {
    className?: string;
}

const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

/**
 * Общая рамка линейного значка.
 * @param props.className Размер
 * @param props.children Контуры
 * @returns SVG 24×24
 */
const LineIcon: React.FC<IconProps & { children: React.ReactNode }> = ({ className, children }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...line}>
        {children}
    </svg>
);

/**
 * Две восьмые под одной балкой. Та же схема, что у прежней ноты, но контуром.
 * @param props.className Размер
 * @returns SVG
 */
export const MusicNoteIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <ellipse cx="6.4" cy="17.4" rx="3.1" ry="2.25" transform="rotate(-28 6.4 17.4)" />
        <ellipse cx="16.6" cy="15.7" rx="3.1" ry="2.25" transform="rotate(-28 16.6 15.7)" />
        <path d="M9.1 16.4V4.6" />
        <path d="M19.2 14.6V7.2" />
        <path d="M9.1 4.6 19.2 7.2" />
    </LineIcon>
);

/**
 * ВКонтакте буквами, без плитки.
 * @param props.className Размер
 * @returns SVG
 */
export const VkIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M3 6.2 7.4 17.8 11.6 6.2" />
        <path d="M13.2 6.2v11.6" />
        <path d="M13.2 12.1 20.8 6.2" />
        <path d="M14.4 11.2 20.8 17.8" />
    </LineIcon>
);

/**
 * YouTube контуром: рамка и треугольник.
 * @param props.className Размер
 * @returns SVG
 */
export const YouTubeIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <rect x="2.75" y="6.25" width="18.5" height="11.5" rx="2.75" />
        <path d="M10.5 9.4v5.2l4.6-2.6z" />
    </LineIcon>
);

/**
 * Поделиться: стрелка из рамки.
 * @param props.className Размер
 * @returns SVG
 */
export const ShareIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <path d="M16 6 12 2 8 6" />
        <path d="M12 2v13" />
    </LineIcon>
);

/**
 * Ссылка на запись: два звена.
 * @param props.className Размер
 * @returns SVG
 */
export const LinkIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </LineIcon>
);

/**
 * Назад к каталогу.
 * @param props.className Размер
 * @returns SVG
 */
export const ArrowLeftIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
    </LineIcon>
);

/**
 * Письмо для входа в браузере.
 * @param props.className Размер
 * @returns SVG
 */
export const MailIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
    </LineIcon>
);

/**
 * Щит админки.
 * @param props.className Размер
 * @returns SVG
 */
export const ShieldIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M12 3 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6z" />
    </LineIcon>
);

/**
 * Крестик закрытия. Тот же контур 1.75, без заливки.
 * @param props.className Размер
 * @returns SVG
 */
export const CloseIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M6 6 18 18" />
        <path d="M18 6 6 18" />
    </LineIcon>
);

/**
 * Ещё действия: три точки в ряд.
 * @param props.className Размер
 * @returns SVG
 */
export const MoreIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <circle cx="5" cy="12" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="19" cy="12" r="1.4" />
    </LineIcon>
);

/**
 * Опубликовать: стрелка вверх из строки.
 * @param props.className Размер
 * @returns SVG
 */
export const PublishIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M12 15V5" />
        <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
        <path d="M5 19h14" />
    </LineIcon>
);

/**
 * Снять с публикации: стрелка вниз к строке.
 * @param props.className Размер
 * @returns SVG
 */
export const UnpublishIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M12 5v10" />
        <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
        <path d="M5 20h14" />
    </LineIcon>
);

/**
 * Изменить запись.
 * @param props.className Размер
 * @returns SVG
 */
export const PencilIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7.5 18.5 3.5 19.5l1-4Z" />
    </LineIcon>
);

/**
 * Удалить запись.
 * @param props.className Размер
 * @returns SVG
 */
export const TrashIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M4 7h16" />
        <path d="M9 7V5h6v2" />
        <path d="M7 7l1 13h8l1-13" />
    </LineIcon>
);

/**
 * Добавить запись, альбом или плейлист.
 * @param props.className Размер
 * @returns SVG
 */
export const PlusIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
    </LineIcon>
);

/**
 * Состав подборки: строки списка.
 * @param props.className Размер
 * @returns SVG
 */
export const ListIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M9 7h11" />
        <path d="M9 12h11" />
        <path d="M9 17h11" />
        <path d="M4 7h.01" />
        <path d="M4 12h.01" />
        <path d="M4 17h.01" />
    </LineIcon>
);

/**
 * Поднять запись в составе.
 * @param props.className Размер
 * @returns SVG
 */
export const ChevronUpIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="m6 14 6-6 6 6" />
    </LineIcon>
);

/**
 * Опустить запись в составе.
 * @param props.className Размер
 * @returns SVG
 */
export const ChevronDownIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="m6 10 6 6 6-6" />
    </LineIcon>
);

/**
 * Убрать запись из состава, не удаляя файл.
 * @param props.className Размер
 * @returns SVG
 */
export const MinusIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M5 12h14" />
    </LineIcon>
);

/**
 * Треугольник play. Заливка: только внутри чёрной кнопки.
 * @param props.className Размер
 * @returns SVG
 */
export const PlayIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8.2 5.4v13.2L19 12 8.2 5.4z" />
    </svg>
);

/**
 * Пауза. Заливка, как у play.
 * @param props.className Размер
 * @returns SVG
 */
export const PauseIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 5h4.2v14H6V5zm7.8 0H18v14h-4.2V5z" />
    </svg>
);

/**
 * Предыдущая запись.
 * @param props.className Размер
 * @returns SVG
 */
export const PreviousIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M6 5v14" />
        <path d="M18 6 8.5 12 18 18z" />
    </LineIcon>
);

/**
 * Следующая запись.
 * @param props.className Размер
 * @returns SVG
 */
export const NextIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M18 5v14" />
        <path d="M6 6 15.5 12 6 18z" />
    </LineIcon>
);

/**
 * Громкость.
 * @param props.className Размер
 * @returns SVG
 */
export const VolumeIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.2 6a8.5 8.5 0 0 1 0 12" />
    </LineIcon>
);

/**
 * Звук выключен.
 * @param props.className Размер
 * @returns SVG
 */
export const VolumeOffIcon: React.FC<IconProps> = ({ className }) => (
    <LineIcon className={className}>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="m16 9 6 6" />
        <path d="m22 9-6 6" />
    </LineIcon>
);
