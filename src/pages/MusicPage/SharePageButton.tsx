/**
 * @file Кнопка «Поделиться» на странице записи, альбома или плейлиста.
 * Ссылка уходит с `from=share`, нажатие пишется в статистику.
 */
import React from 'react';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { useToast } from '@/hooks/useToast.ts';
import { ShareIcon } from '@/components/Icons/Icons.tsx';
import { recordMusicEvent, withShareSource } from '@/music/listenStats.ts';
import { copyText, openShareTarget, shareLink } from './shareLink.ts';
import css from './MusicPage.module.css';

interface SharePageButtonProps {
    /** Заголовок для листа «Поделиться» и текста Telegram. */
    title: string;
    /** Абсолютный адрес страницы без метки источника. */
    url: string;
    /** Запись, если делятся её страницей. */
    trackId?: string | null;
    /** Альбом. */
    albumId?: string | null;
    /** Плейлист. */
    playlistId?: string | null;
}

/**
 * Делится страницей: Web Share API, иначе «Ссылка скопирована»,
 * в Mini App при закрытом буфере — t.me/share/url.
 * @param props Заголовок, адрес и цель статистики
 * @returns Кнопка и тост
 */
export const SharePageButton: React.FC<SharePageButtonProps> = ({
    title,
    url,
    trackId = null,
    albumId = null,
    playlistId = null,
}) => {
    const { isInTelegram } = useAuth();
    const { toasts, showToast, removeToast } = useToast();
    const shareUrl = withShareSource(url);

    const onShare = () => {
        if (trackId || albumId || playlistId) {
            recordMusicEvent('share', { trackId, albumId, playlistId });
        }
        const canShare = typeof navigator.share === 'function';
        void shareLink(
            { title, url: shareUrl },
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
