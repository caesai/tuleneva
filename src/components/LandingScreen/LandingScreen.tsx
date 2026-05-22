import React from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { SocialLinks } from '@/components/SocialLinks/SocialLinks.tsx';
import { LANDING_PAGE_META } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import css from '@/components/LandingScreen/LandingScreen.module.css';

/**
 * Главный экран: логотип по центру и ссылки на соцсети под ним.
 */
export const LandingScreen: React.FC = () => {
    usePageMeta(LANDING_PAGE_META);

    return (
        <div className={css.screen}>
            <Loader fullScreen={false} />
            <SocialLinks />
        </div>
    );
};
