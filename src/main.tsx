import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/lib/moment';
import { init } from '@/init.ts';
import App from '@/App.tsx';
import { AuthProvider } from '@/contexts/AuthContext.tsx';
import './App.css';
import './index.css';
import '@telegram-apps/telegram-ui/dist/styles.css';

const root = createRoot(document.getElementById('root')!);

init();

root.render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>,
);
