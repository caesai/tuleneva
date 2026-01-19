import React from 'react';
import tulenevaLogo from '/logo_main512.svg';
import css from '@/components/Loader/Loader.module.css';

export const Loader: React.FC = () => {
    return (
        <div className={css.loader}>
            <img src={tulenevaLogo} className={css.logo} alt="Tuleneva 25" />
        </div>
    );
};
