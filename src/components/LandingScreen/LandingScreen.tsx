/**
 * @file Главный экран: логотип по центру, три значка на орбите.
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader } from '@/components/Loader/Loader.tsx';
import { MusicNoteIcon, VkIcon, YouTubeIcon } from '@/components/Icons/Icons.tsx';
import { SOCIAL_LINKS } from '@/config/socialLinks.ts';
import { LANDING_PAGE_META } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import css from '@/components/LandingScreen/LandingScreen.module.css';

interface OrbitLink {
    href: string;
    label: string;
    angle: number;
    external?: boolean;
    icon: React.ReactNode;
}

/**
 * Три одинаковых значка через 120°: нота сверху, затем ВК и YouTube.
 * @returns Ссылки орбиты
 */
const orbitLinks = (): OrbitLink[] => {
    const byId = new Map(SOCIAL_LINKS.map((item) => [item.id, item]));
    const vk = byId.get('vk');
    const youtube = byId.get('youtube');
    if (!vk || !youtube) {
        return [
            { href: '/music', label: 'Музыка', angle: 0, icon: <MusicNoteIcon className={css.orbitIcon} /> },
        ];
    }
    return [
        { href: '/music', label: 'Музыка', angle: 0, icon: <MusicNoteIcon className={css.orbitIcon} /> },
        { href: vk.href, label: vk.label, angle: 120, external: true, icon: <VkIcon className={css.orbitIcon} /> },
        {
            href: youtube.href,
            label: youtube.label,
            angle: 240,
            external: true,
            icon: <YouTubeIcon className={css.orbitIcon} />,
        },
    ];
};

/**
 * Главный экран без прокрутки. Значки крутятся вокруг логотипа и не сдвигают его.
 * @returns Экран
 */
export const LandingScreen: React.FC = () => {
    usePageMeta(LANDING_PAGE_META);

    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const previous = {
            htmlOverflow: html.style.overflow,
            bodyOverflow: body.style.overflow,
            bodyMinHeight: body.style.minHeight,
        };
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.minHeight = '0px';
        return () => {
            html.style.overflow = previous.htmlOverflow;
            body.style.overflow = previous.bodyOverflow;
            body.style.minHeight = previous.bodyMinHeight;
        };
    }, []);

    return (
        <div className={css.screen}>
            <div className={css.hero}>
                <Loader fullScreen={false} logoClassName={css.heroLogo} />
                <nav className={css.orbit} aria-label="Ссылки студии">
                    {orbitLinks().map((item) => {
                        const style = { '--angle': `${item.angle}deg` } as React.CSSProperties;
                        const face = <span className={css.orbitFace}>{item.icon}</span>;
                        if (item.external) {
                            return (
                                <a
                                    key={item.label}
                                    className={css.orbitSlot}
                                    href={item.href}
                                    aria-label={item.label}
                                    title={item.label}
                                    style={style}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {face}
                                </a>
                            );
                        }
                        return (
                            <Link
                                key={item.label}
                                className={css.orbitSlot}
                                to={item.href}
                                aria-label={item.label}
                                title={item.label}
                                style={style}
                            >
                                {face}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
};
