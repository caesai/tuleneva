import React from 'react';
import { SOCIAL_LINKS } from '@/config/socialLinks.ts';
import { SocialLinkIcon } from '@/components/SocialLinks/SocialLinkIcons.tsx';
import css from '@/components/SocialLinks/SocialLinks.module.css';

/**
 * Иконки-ссылки на соцсети студии (серые, при наведении — чёрные).
 */
export const SocialLinks: React.FC = () => {
    return (
        <nav className={css.links} aria-label="Соцсети студии">
            {SOCIAL_LINKS.map((item) => (
                <a
                    key={item.id}
                    className={css.link}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    title={item.label}
                >
                    <SocialLinkIcon id={item.id} className={css.icon} />
                </a>
            ))}
        </nav>
    );
};
