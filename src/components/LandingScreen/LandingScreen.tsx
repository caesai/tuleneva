import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader } from '@/components/Loader/Loader.tsx';
import { MusicNoteIcon } from '@/components/LandingScreen/MusicNoteIcon.tsx';
import { SocialLinks } from '@/components/SocialLinks/SocialLinks.tsx';
import { LANDING_PAGE_META } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import css from '@/components/LandingScreen/LandingScreen.module.css';

/**
 * Главный экран: крупный логотип по центру; по нажатию вокруг него
 * раскрываются соцсети и нота — ссылка на публичную музыку.
 */
export const LandingScreen: React.FC = () => {
    usePageMeta(LANDING_PAGE_META);
    const [socialLinksOpen, setSocialLinksOpen] = useState(false);

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
                        <Link className={css.musicNote} to="/music" aria-label="Музыка" title="Музыка">
                            <MusicNoteIcon className={css.musicNoteIcon} />
                        </Link>
                    </>
                ) : null}
            </div>
            <Link className={css.musicLink} to="/music">Слушать</Link>
        </div>
    );
};
