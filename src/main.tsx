/**
 * @file Точка входа. init() не имеет права помешать монтированию:
 * ошибка SDK или чанка остаётся внутри границы, а не белым #root.
 */
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@/lib/moment';
import { init } from '@/init.ts';
import { installChunkReloadListener } from '@/boot/chunkReload.ts';
import { AppErrorBoundary } from '@/components/AppErrorBoundary/AppErrorBoundary.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import App from '@/App.tsx';
import { AuthProvider } from '@/contexts/AuthContext.tsx';
import './App.css';
import './index.css';
import '@telegram-apps/telegram-ui/dist/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Не найден #root');
}

installChunkReloadListener();

try {
    init();
} catch (error) {
    console.warn('Старт приложения не остановил монтирование:', error);
}

createRoot(rootElement).render(
    <StrictMode>
        <AppErrorBoundary>
            <Suspense fallback={<Loader fullScreen />}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </Suspense>
        </AppErrorBoundary>
    </StrictMode>,
);
