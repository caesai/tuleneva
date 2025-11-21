import React, { useEffect, useState } from 'react';
import { swipeBehavior, useLaunchParams } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { TimeTablePage } from '@/pages/TimeTablePage/TimeTablePage.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';

const App: React.FC = () => {
    const lp = useLaunchParams();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        swipeBehavior.mount();
    }, []);

    useEffect(() => {
        if (!token) {
            openModal();
        }
    }, [token]);

    const handleConfirm = () => {
        closeModal();
    };

    return (
        <AppRoot
            appearance={'light'}
            platform={
                ['macos', 'ios'].includes(lp.tgWebAppPlatform) ? 'ios' : 'base'
            }
        >
            <>
                <ModalPopup isOpen={isModalOpen} onClose={closeModal}>
                    <div>
                        <h3>Тюленева 25</h3>
                        <p>Бронирование репетиций доступно после подтверждения от администратора</p>
                        <button onClick={handleConfirm}>Понятно</button>
                    </div>
                </ModalPopup>
                <TimeTablePage />
            </>
        </AppRoot>
    );
};

export default App;
