// src/components/NetworkBanner/NetworkBanner.tsx
import React, { useEffect, useState } from 'react';
import css from './NetworkBanner.module.css';

interface NetworkBannerProps {
    /** Текущий статус подключения */
    isOnline: boolean;
}

/**
 * Компонент баннера для отображения статуса сетевого подключения.
 * Показывается вверху экрана, не блокирует интерфейс.
 * Автоматически скрывается через 2 секунды после восстановления связи.
 */
export const NetworkBanner: React.FC<NetworkBannerProps> = ({ isOnline }) => {
    const [visible, setVisible] = useState<boolean>(false);
    const [showOnlineMessage, setShowOnlineMessage] = useState<boolean>(false);
    const [wasEverOffline, setWasEverOffline] = useState<boolean>(false);

    useEffect(() => {
        if (!isOnline) {
            // Показываем баннер при потере связи
            setVisible(true);
            setShowOnlineMessage(false);
            setWasEverOffline(true);
        } else if (wasEverOffline) {
            // Показываем сообщение о восстановлении, только если были офлайн
            setShowOnlineMessage(true);
            setVisible(true);
            
            // Скрываем баннер через 2 секунды после восстановления
            const timer = setTimeout(() => {
                setVisible(false);
                setShowOnlineMessage(false);
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [isOnline, wasEverOffline]);

    const getBannerClass = () => {
        if (!isOnline) return css.offline;
        if (showOnlineMessage) return css.online;
        return '';
    };

    const getMessage = () => {
        if (!isOnline) return 'Нет подключения к интернету';
        if (showOnlineMessage) return 'Подключение восстановлено';
        return '';
    };

    const getIcon = () => {
        if (!isOnline) return '⚠️';
        if (showOnlineMessage) return '✓';
        return '';
    };

    // Не рендерим ничего, если не нужно показывать
    if (!visible && isOnline) return null;

    return (
        <>
            {/* Spacer для предотвращения перекрытия контента */}
            <div className={`${css.spacer} ${visible ? css.active : ''}`} />
            
            <div className={`${css.banner} ${getBannerClass()} ${visible ? css.visible : ''}`}>
                <span className={css.icon}>{getIcon()}</span>
                <span className={css.message}>{getMessage()}</span>
            </div>
        </>
    );
};
