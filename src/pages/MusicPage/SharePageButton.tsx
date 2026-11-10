/**
 * @file Кнопка «Поделиться» на странице альбома или плейлиста.
 */
import React from 'react';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { useToast } from '@/hooks/useToast.ts';
import { ShareIcon } from '@/components/Icons/Icons.tsx';
import { copyText, openShareTarget, shareLink } from './shareLink.ts';
import css from './MusicPage.module.css';

interface SharePageButtonProps {
    /** Заголовок для листа «Поделиться» и текста Telegram. */
    title: string;
    /** Абсолютный адрес страницы. */
    url: string;
}

/**
 * Делится страницей: Web Share API, иначе «Ссылка скопирована»,
 * в Mini App при закрытом буфере — t.me/share/url.
 * @param props Заголовок и адрес
 * @returns Кнопка и тост
 */
export const SharePageButton: React.FC<SharePageButtonProps> = ({ title, url }) => {
    const { isInTelegram } = useAuth();
    const { toasts, showToast, removeToast } = useToast();

    const onShare = () => {
        const canShare = typeof navigator.share === 'function';
        void shareLink(
            { title, url },
            {
                share: canShare
                    ? (data) => navigator.share(data)
                    : undefined,
                copy: copyText,
                open: openShareTarget,
                inTelegram: isInTelegram,
            },
        ).then((result) => {
            if (result === 'copied') {
                showToast('Ссылка скопирована', 'success', 2200);
                return;
            }
            if (result === 'failed') {
                showToast('Не удалось поделиться ссылкой', 'error', 2500);
            }
        });
    };

    return (
        <>
            <button
                type="button"
                className={css.shareButton}
                onClick={onShare}
                aria-label="Поделиться"
                title="Поделиться"
            >
                <ShareIcon className={css.shareGlyph} />
            </button>
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </>
    );
};
