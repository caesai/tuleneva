/**
 * @file Маршруты приложения. Ленивые страницы при битом чанке обновляются один раз.
 */
import React, { useEffect, useState, Suspense } from 'react';
import { lazyWithRetry } from '@/boot/lazyWithRetry.ts';
import { ChunkReloadReset } from '@/boot/ChunkReloadReset.tsx';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ScrollToTop } from '@/navigation/ScrollToTop.tsx';
import { ListenAttribution } from '@/music/ListenAttribution.tsx';
import { swipeBehavior } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { ThemeProvider } from '@mui/material/styles';
import { appTheme } from '@/theme/appTheme.ts';
import ui from '@/theme/ui.module.css';
import { useSafeLaunchParams } from '@/telegram/useSafeLaunchParams.ts';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { Loader } from '@/components/Loader/Loader.tsx';
import { LandingScreen } from '@/components/LandingScreen/LandingScreen.tsx';
import { AdminRoute } from '@/components/AdminRoute/AdminRoute.tsx';
import { NetworkProvider } from '@/contexts/NetworkContext.tsx';
import { WebSocketProvider } from '@/contexts/WebSocketContext.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { EmailAuthForm } from '@/components/EmailAuthForm/EmailAuthForm.tsx';
import { getTelegramEnvironment } from '@/telegram/env.ts';
import { useLandingInvite } from '@/auth/useInviteEntry.ts';
import { useEmailAuth } from '@/auth/useEmailAuth.ts';
import { EMAIL_AUTH_UI_ENABLED } from '@/config/emailAuthUi.ts';

const TimeTablePage = lazyWithRetry(() =>
    import('@/pages/TimeTablePage/TimeTablePage.tsx').then((m) => ({ default: m.TimeTablePage })),
);

const AdminPage = lazyWithRetry(() =>
    import('@/pages/AdminPage/AdminPage.tsx').then((m) => ({ default: m.AdminPage })),
);

const MusicPage = lazyWithRetry(() =>
    import('@/pages/MusicPage/MusicPage.tsx').then((m) => ({ default: m.MusicPage })),
);

const MusicCollectionPage = lazyWithRetry(() =>
    import('@/pages/MusicPage/MusicCollectionPage.tsx').then((m) => ({ default: m.MusicCollectionPage })),
);

const AdminMusicPage = lazyWithRetry(() =>
    import('@/pages/AdminMusicPage/AdminMusicPage.tsx').then((m) => ({ default: m.AdminMusicPage })),
);

const IndexPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLinkEmailOpen, setIsLinkEmailOpen] = useState(false);
    const [linkEmailLoading, setLinkEmailLoading] = useState(false);
    const closeModal = () => setIsModalOpen(false);

    const { isTelegram } = useSafeLaunchParams();
    const isInTelegram = isTelegram && getTelegramEnvironment();

    const {
        user,
        isLoading,
        isAuthenticated,
        register,
        registerWithInvite,
    } = useAuth();
    const { linkEmailPassword } = useEmailAuth();
    const { toasts, showToast, removeToast } = useToast();

    const {
        isInviteModalOpen,
        setIsInviteModalOpen,
        inviteLoading,
        webFirstName,
        setWebFirstName,
        webLastName,
        setWebLastName,
        showWebInviteForm,
        handleInviteRequestAccess,
    } = useLandingInvite({
        isLoading,
        isAuthenticated,
        user,
        isInTelegram: Boolean(isInTelegram),
        registerWithInvite,
        showToast,
        onWebInviteSuccess: () => {
            if (EMAIL_AUTH_UI_ENABLED) {
                setIsLinkEmailOpen(true);
            }
        },
    });

    const handleConfirm = () => {
        closeModal();
    };

    const handleRequestAccess = async () => {
        try {
            await register();
            showToast('Запрос на доступ отправлен администратору.', 'success');
        } catch (err) {
            console.error('Request access failed:', err);
            showToast('Не удалось отправить запрос.', 'error');
        }
    };

    return (
        <>
            <ToastContainer toasts={toasts} onRemove={removeToast} />
            <ModalPopup isOpen={isModalOpen} onClose={closeModal} title="Тюленева 25">
                <div className={ui.stack}>
                    <p className={ui.lead}>
                        {isAuthenticated && user?.role === 'guest'
                            ? 'Ваш аккаунт ожидает подтверждения администратором. Вы пока не можете бронировать репетиции.'
                            : 'Для доступа к бронированию необходима авторизация.'}
                    </p>
                    <div className={ui.actions}>
                        <button type="button" className={ui.secondary} onClick={handleConfirm}>
                            Понятно
                        </button>
                        {user?.role === 'guest' && (
                            <button type="button" className={ui.primary} onClick={handleRequestAccess}>
                                Запросить доступ
                            </button>
                        )}
                    </div>
                </div>
            </ModalPopup>

            {/* Модальное окно для инвайт-ссылки */}
            <ModalPopup isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Тюленева 25">
                <div className={ui.stack}>
                    <p className={ui.lead}>
                        {showWebInviteForm
                            ? 'Вы были приглашены. Заполните форму, чтобы запросить доступ к бронированию репетиций.'
                            : 'Вы были приглашены. Нажмите кнопку ниже, чтобы запросить доступ к бронированию репетиций.'}
                    </p>
                    {showWebInviteForm && (
                        <>
                            <label className={ui.label}>
                                Имя
                                <input
                                    className={ui.field}
                                    type="text"
                                    name="given-name"
                                    autoComplete="given-name"
                                    placeholder="Имя"
                                    value={webFirstName}
                                    onChange={(e) => setWebFirstName(e.target.value)}
                                    required
                                />
                            </label>
                            <label className={ui.label}>
                                Фамилия
                                <input
                                    className={ui.field}
                                    type="text"
                                    name="family-name"
                                    autoComplete="family-name"
                                    placeholder="Фамилия"
                                    value={webLastName}
                                    onChange={(e) => setWebLastName(e.target.value)}
                                />
                            </label>
                        </>
                    )}
                    <div className={ui.actions}>
                        <button
                            type="button"
                            className={ui.primary}
                            onClick={handleInviteRequestAccess}
                            disabled={inviteLoading}
                        >
                            {inviteLoading ? 'Отправка...' : 'Запросить доступ'}
                        </button>
                    </div>
                </div>
            </ModalPopup>

            <ModalPopup
                isOpen={EMAIL_AUTH_UI_ENABLED && isLinkEmailOpen}
                onClose={() => setIsLinkEmailOpen(false)}
                title="Привяжите почту"
            >
                <div className={ui.stack}>
                    <p className={ui.lead}>
                        Без почты сессия в браузере действует одни сутки. После
                        подтверждения письма сможете войти снова. Можно закрыть
                        и привязать позже в расписании.
                    </p>
                    <EmailAuthForm
                        mode="link"
                        submitLabel="Привязать почту"
                        loading={linkEmailLoading}
                        onSubmit={async ({ email, password }) => {
                            if (!email || !password) return;
                            setLinkEmailLoading(true);
                            try {
                                const result = await linkEmailPassword(email, password);
                                if (result.pendingConfirmation) {
                                    showToast(
                                        'Проверьте почту — перейдите по ссылке для подтверждения.',
                                        'success',
                                    );
                                } else {
                                    showToast('Почта привязана.', 'success');
                                }
                                setIsLinkEmailOpen(false);
                            } catch (err) {
                                showToast(
                                    err instanceof Error
                                        ? err.message
                                        : 'Не удалось привязать почту. Если SMTP не настроен, попробуйте позже.',
                                    'error',
                                );
                                throw err;
                            } finally {
                                setLinkEmailLoading(false);
                            }
                        }}
                    />
                    <div className={ui.actions}>
                        <button type="button" className={ui.secondary} onClick={() => setIsLinkEmailOpen(false)}>
                            Позже
                        </button>
                    </div>
                </div>
            </ModalPopup>

            <LandingScreen />
        </>
    );
};

const App: React.FC = () => {
    const { launchParams: lp } = useSafeLaunchParams();

    useEffect(() => {
        try {
            if (swipeBehavior.mount.isAvailable()) {
                swipeBehavior.mount();
            }
        } catch (e) {
            console.warn('Swipe behavior mount failed:', e);
        }
    }, []);

    const platform = ['macos', 'ios'].includes(lp.tgWebAppPlatform) ? 'ios' : 'base';

    return (
        <ThemeProvider theme={appTheme}>
        <AppRoot appearance="light" platform={platform}>
            <NetworkProvider>
                <WebSocketProvider>
                    <BrowserRouter>
                        <ScrollToTop />
                        <ListenAttribution />
                        <Suspense fallback={<Loader fullScreen />}>
                            <ChunkReloadReset />
                            <Routes>
                                <Route path="/" element={<IndexPage />} />
                                <Route path="/app" element={<TimeTablePage />} />
                                <Route path="/music" element={<MusicPage />} />
                                <Route path="/music/album/:id" element={<MusicCollectionPage />} />
                                <Route path="/music/playlist/:id" element={<MusicCollectionPage />} />
                                <Route path="/music/:trackId" element={<MusicPage />} />
                                <Route
                                    path="/admin"
                                    element={
                                        <AdminRoute>
                                            <AdminPage />
                                        </AdminRoute>
                                    }
                                />
                                <Route
                                    path="/admin/music"
                                    element={
                                        <AdminRoute>
                                            <AdminMusicPage />
                                        </AdminRoute>
                                    }
                                />
                            </Routes>
                        </Suspense>
                    </BrowserRouter>
                </WebSocketProvider>
            </NetworkProvider>
        </AppRoot>
        </ThemeProvider>
    );
};

export default App;
