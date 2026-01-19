import React, { useEffect, useState, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { swipeBehavior, useLaunchParams } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { TimeTablePage } from '@/pages/TimeTablePage/TimeTablePage.tsx';
import { AdminPage } from '@/pages/AdminPage/AdminPage.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { Loader } from '@/components/Loader/Loader.tsx';
import { NetworkProvider } from '@/contexts/NetworkContext.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { ToastContainer } from '@/components/Toast/Toast.tsx';

const IndexPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const closeModal = () => setIsModalOpen(false);

    // Используем контекст авторизации
    const { user, isLoading, isAuthenticated, register } = useAuth();
    const { toasts, showToast, removeToast } = useToast();

    // Эффект для управления модальным окном в зависимости от роли
    useEffect(() => {
        if (!isLoading) {
            // Если пользователь гость или не авторизован - показываем предупреждение
            if (!isAuthenticated || (user && user.role === 'guest')) {
                setIsModalOpen(true);
            } else {
                setIsModalOpen(false);
            }
        }
    }, [isLoading, isAuthenticated, user]);

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

    if (isLoading) {
        return <Loader />;
    }

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

            <TimeTablePage />
        </>
    );
};

const App: React.FC = () => {
    const lp = useLaunchParams();

    useEffect(() => {
        try {
            if (swipeBehavior.mount.isAvailable()) {
                swipeBehavior.mount();
            }
        } catch (e) {
            console.warn('Swipe behavior mount failed:', e);
        }
    }, []);

    return (
        <AppRoot
            appearance={'light'}
            platform={
                ['macos', 'ios'].includes(lp.tgWebAppPlatform) ? 'ios' : 'base'
            }
        >
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
