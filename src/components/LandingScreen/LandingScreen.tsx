import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader } from '@/components/Loader/Loader.tsx';
import { MusicNoteIcon } from '@/components/LandingScreen/MusicNoteIcon.tsx';
import { SocialLinks } from '@/components/SocialLinks/SocialLinks.tsx';
import socialCss from '@/components/SocialLinks/SocialLinks.module.css';
import { LANDING_PAGE_META } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import css from '@/components/LandingScreen/LandingScreen.module.css';

/** Левый нижний угол той же орбиты, что у иконок соцсетей. */
const MUSIC_NOTE_ORBIT = {
    '--y-x-mult': -0.78,
    '--y-y-mult': 0.72,
    '--y-delay': '0.42s',
} as React.CSSProperties;

/**
 * Главный экран: логотип по центру видимой области, без прокрутки.
 * По нажатию вокруг него раскрываются соцсети и нота — ссылка на музыку.
 */
export const LandingScreen: React.FC = () => {
    usePageMeta(LANDING_PAGE_META);
    const [socialLinksOpen, setSocialLinksOpen] = useState(false);

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
                <Loader
                    fullScreen={false}
                    onLogoClick={() => setSocialLinksOpen((open) => !open)}
                    logoAriaExpanded={socialLinksOpen}
                    logoClassName={css.heroLogo}
                />
                {socialLinksOpen ? (
                    <>
                        <SocialLinks layout="y" />
                        <Link
                            className={socialCss.linkY}
                            to="/music"
                            aria-label="Музыка"
                            title="Музыка"
                            style={MUSIC_NOTE_ORBIT}
                        >
                            <MusicNoteIcon className={`${socialCss.iconY} ${css.musicNoteIcon}`} />
                        </Link>
                    </>
                ) : null}
            </div>
        </div>
    );
};
