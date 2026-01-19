import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Импортируем настроенный moment первым делом
import '@/lib/moment';
import { init } from '@/init.ts';
import App from '@/App.tsx';
import { AuthProvider } from '@/contexts/AuthContext.tsx';

import { Site } from '@/Site.tsx';
import './App.css';
import './index.css';
import '@telegram-apps/telegram-ui/dist/styles.css';
const root = createRoot(document.getElementById('root')!);


try {
    // Configure all application dependencies.
    init();

    root.render(
        <StrictMode>
            <AuthProvider>
                <App />
            </AuthProvider>
        </StrictMode>,
    );
} catch (error) {
    console.error('Error initializing application:', error);
    root.render(<Site />);
}
