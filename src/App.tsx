import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { swipeBehavior } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { useSafeLaunchParams } from '@/telegram/useSafeLaunchParams.ts';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { SuspenseLoaderFallback } from '@/components/Loader/SuspenseLoaderFallback.tsx';
import { LandingScreen } from '@/components/LandingScreen/LandingScreen.tsx';
import { AdminRoute } from '@/components/AdminRoute/AdminRoute.tsx';
import { NetworkProvider } from '@/contexts/NetworkContext.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { EmailAuthForm } from '@/components/EmailAuthForm/EmailAuthForm.tsx';
import { getTelegramEnvironment } from '@/telegram/env.ts';
import { useLandingInvite } from '@/auth/useInviteEntry.ts';

const TimeTablePage = lazy(() =>
    import('@/pages/TimeTablePage/TimeTablePage.tsx').then((m) => ({ default: m.TimeTablePage })),
);

const AdminPage = lazy(() =>
    import('@/pages/AdminPage/AdminPage.tsx').then((m) => ({ default: m.AdminPage })),
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
        linkEmailPassword,
    } = useAuth();
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
        onWebInviteSuccess: () => setIsLinkEmailOpen(true),
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
            <ModalPopup isOpen={isModalOpen} onClose={closeModal}>
                <div>
                    <h3>Тюленева 25</h3>
                    <p>
                        {isAuthenticated && user?.role === 'guest'
                            ? 'Ваш аккаунт ожидает подтверждения администратором. Вы пока не можете бронировать репетиции.'
                            : 'Для доступа к бронированию необходима авторизация.'}
                    </p>
                    <button onClick={handleConfirm} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#007aff', color: 'white' }}>
                        Понятно
                    </button>
                    {user?.role === 'guest' && (
                        <button
                            style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#007aff', color: 'white' }}
                            onClick={handleRequestAccess}
                        >
                            Запросить доступ
                        </button>
                    )}
                </div>
            </ModalPopup>

            {/* Модальное окно для инвайт-ссылки */}
            <ModalPopup isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '260px' }}>
                    <h3 style={{ margin: 0 }}>Тюленева 25</h3>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>
                        {showWebInviteForm
                            ? 'Вы были приглашены. Заполните форму, чтобы запросить доступ к бронированию репетиций.'
                            : 'Вы были приглашены. Нажмите кнопку ниже, чтобы запросить доступ к бронированию репетиций.'}
                    </p>
                    {showWebInviteForm && (
                        <>
                            <input
                                type="text"
                                placeholder="Имя *"
                                value={webFirstName}
                                onChange={(e) => setWebFirstName(e.target.value)}
                                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
                            />
                            <input
                                type="text"
                                placeholder="Фамилия"
                                value={webLastName}
                                onChange={(e) => setWebLastName(e.target.value)}
                                style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}
                            />
                        </>
                    )}
                    <button
                        onClick={handleInviteRequestAccess}
                        disabled={inviteLoading}
                        style={{
                            marginTop: '4px',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#007aff',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: inviteLoading ? 'not-allowed' : 'pointer',
                            opacity: inviteLoading ? 0.6 : 1,
                        }}
                    >
                        {inviteLoading ? 'Отправка...' : 'Запросить доступ'}
                    </button>
                </div>
            </ModalPopup>

            <ModalPopup
                isOpen={isLinkEmailOpen}
                onClose={() => setIsLinkEmailOpen(false)}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '280px' }}>
                    <h3 style={{ margin: 0 }}>Привяжите почту</h3>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>
                        Без почты сессия в браузере действует одни сутки. После
                        подтверждения письма сможете войти снова. Можно закрыть
                        и привязать позже в расписании.
                    </p>
                    <EmailAuthForm
                        submitLabel="Привязать почту"
                        loading={linkEmailLoading}
                        onSubmit={async (email, password) => {
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
                    <button
                        type="button"
                        onClick={() => setIsLinkEmailOpen(false)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid #ccc',
                            background: 'transparent',
                            cursor: 'pointer',
                        }}
                    >
                        Позже
                    </button>
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
        <AppRoot appearance="light" platform={platform}>
            <NetworkProvider>
                <BrowserRouter>
                    <Suspense fallback={<SuspenseLoaderFallback fullScreen />}>
                        <Routes>
                            <Route path="/" element={<IndexPage />} />
                            <Route path="/app" element={<TimeTablePage />} />
                            <Route
                                path="/admin"
                                element={
                                    <AdminRoute>
                                        <AdminPage />
                                    </AdminRoute>
                                }
                            />
                        </Routes>
                    </Suspense>
                </BrowserRouter>
            </NetworkProvider>
        </AppRoot>
    );
};

export default App;
