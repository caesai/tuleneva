import React, { useEffect, useState, Suspense, useCallback, lazy } from 'react';
import { BrowserRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { swipeBehavior } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { TimeTablePage } from '@/pages/TimeTablePage/TimeTablePage.tsx';
import { useSafeLaunchParams } from '@/telegram/useSafeLaunchParams.ts';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { Loader } from '@/components/Loader/Loader.tsx';
import { NetworkProvider } from '@/contexts/NetworkContext.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { APIValidateInvite } from '@/api/user.api.ts';

const AdminPage = lazy(() =>
    import('@/pages/AdminPage/AdminPage.tsx').then((m) => ({ default: m.AdminPage })),
);

const IndexPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [inviteLoading, setInviteLoading] = useState(false);
    const closeModal = () => setIsModalOpen(false);

    const [searchParams, setSearchParams] = useSearchParams();

    // Используем контекст авторизации
    const { user, isLoading, isAuthenticated, register, registerWithInvite } = useAuth();
    const { toasts, showToast, removeToast } = useToast();

    const clearInviteParams = useCallback(() => {
        searchParams.delete('tgWebAppStartParam');
        searchParams.delete('invite');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams]);

    // Инвайт: Telegram startapp или web ?invite=
    useEffect(() => {
        const code = searchParams.get('tgWebAppStartParam') || searchParams.get('invite');
        if (code && !isLoading) {
            if (isAuthenticated && user?.isRegistered) {
                clearInviteParams();
                return;
            }

            setInviteCode(code);
            APIValidateInvite(code).then(async (res) => {
                const data = await res.json();
                if (data.valid) {
                    setIsInviteModalOpen(true);
                } else {
                    showToast('Ссылка-приглашение недействительна или уже использована.', 'error');
                    clearInviteParams();
                }
            }).catch(() => {
                showToast('Не удалось проверить ссылку-приглашение.', 'error');
            });
        }
    }, [isLoading, isAuthenticated, user, searchParams, clearInviteParams, showToast]);

    // Эффект для управления модальным окном в зависимости от роли
    // useEffect(() => {
    //     if (!isLoading) {
    //         // Если пользователь гость или не авторизован - показываем предупреждение
    //         if (!isAuthenticated || (user && user.role === 'guest')) {
    //             setIsModalOpen(true);
    //         } else {
    //             setIsModalOpen(false);
    //         }
    //     }
    // }, [isLoading, isAuthenticated, user]);

    const handleConfirm = () => {
        closeModal();
    };

    // const isUnregistered = user && !user.isRegistered && !user._id;

    const handleRequestAccess = async () => {
        try {
            await register();
            showToast('Запрос на доступ отправлен администратору.', 'success');
        } catch (err) {
            console.error('Request access failed:', err);
            showToast('Не удалось отправить запрос.', 'error');
        }
    };

    const handleInviteRequestAccess = useCallback(async () => {
        if (!inviteCode) return;
        setInviteLoading(true);
        try {
            await registerWithInvite(inviteCode);
            showToast('Запрос на доступ отправлен администратору.', 'success');
            setIsInviteModalOpen(false);
            clearInviteParams();
            setInviteCode(null);
        } catch (err) {
            console.error('Invite request access failed:', err);
            showToast('Не удалось отправить запрос. Ссылка может быть уже использована.', 'error');
        } finally {
            setInviteLoading(false);
        }
    }, [inviteCode, registerWithInvite, showToast, clearInviteParams]);

    // if (isLoading) {
    //     return <Loader />;
    // }

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
                        Вы были приглашены. Нажмите кнопку ниже, чтобы запросить доступ к бронированию репетиций.
                    </p>
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

            <TimeTablePage />
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
                    <Suspense fallback={<Loader />}>
                        <Routes>
                            <Route path="/" element={<IndexPage />} />
                            <Route path="/admin" element={<AdminPage />} />
                        </Routes>
                    </Suspense>
                </BrowserRouter>
            </NetworkProvider>
        </AppRoot>
    );
};

export default App;
