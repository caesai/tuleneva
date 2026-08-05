import React, { useState } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { SocialLinks } from '@/components/SocialLinks/SocialLinks.tsx';
import { LANDING_PAGE_META } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import css from '@/components/LandingScreen/LandingScreen.module.css';

/**
 * Главный экран: крупный логотип по центру; соцсети по клику раскрываются буквой Y вокруг него.
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
                {socialLinksOpen ? <SocialLinks layout="y" /> : null}
            </div>
        </div>
    );
};
