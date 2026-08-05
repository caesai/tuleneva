import React from 'react';
import { SOCIAL_LINKS } from '@/config/socialLinks.ts';
import { SocialLinkIcon } from '@/components/SocialLinks/SocialLinkIcons.tsx';
import css from '@/components/SocialLinks/SocialLinks.module.css';

/** Раскладка: строка под логотипом или буква Y вокруг центра. */
export type TSocialLinksLayout = 'row' | 'y';

export interface ISocialLinksProps {
    /** row — горизонтальный ряд; y — две иконки по бокам сверху и одна снизу (лендинг). */
    layout?: TSocialLinksLayout;
}

/** Смещение иконки на раскладке Y (множители для --y-arm-x / --y-arm-y). */
interface IYBranchPosition {
    xMult: number;
    yMult: number;
    delayIndex: number;
}

/**
 * Позиции веток Y по часовой: левый верх → правый верх → низ.
 * Порядок SOCIAL_LINKS: telegram, vk, youtube.
 */
const Y_BRANCH_POSITIONS: readonly IYBranchPosition[] = [
    { xMult: -1, yMult: -0.42, delayIndex: 0 },
    { xMult: 1, yMult: -0.42, delayIndex: 1 },
    { xMult: 0, yMult: 1, delayIndex: 2 },
] as const;

/** Задержка между появлением соседних иконок по часовой, с. */
const Y_STAGGER_S = 0.14;

/**
 * Иконки-ссылки на соцсети студии (серые, при наведении — чёрные).
 * @param props.layout - row или y вокруг центра родителя
 */
export const SocialLinks: React.FC<ISocialLinksProps> = ({ layout = 'row' }) => {
    const isY = layout === 'y';

    return (
        <nav
            id="landing-social-links"
            className={isY ? css.linksY : css.links}
            aria-label="Соцсети студии"
        >
            {SOCIAL_LINKS.map((item, index) => {
                const branch = Y_BRANCH_POSITIONS[index];

                return (
                    <a
                        key={item.id}
                        className={isY ? css.linkY : css.link}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={item.label}
                        title={item.label}
                        style={
                            isY && branch
                                ? ({
                                      '--y-x-mult': branch.xMult,
                                      '--y-y-mult': branch.yMult,
                                      '--y-delay': `${branch.delayIndex * Y_STAGGER_S}s`,
                                  } as React.CSSProperties)
                                : undefined
                        }
                    >
                        <SocialLinkIcon
                            id={item.id}
                            className={isY ? css.iconY : css.icon}
                        />
                    </a>
                );
            })}
        </nav>
    );
};
