import React, { useMemo } from 'react';
import { Placeholder, AppRoot } from '@telegram-apps/telegram-ui';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import poster from '/Logo_Big_003.jpg';

export const Site: React.FC = () => {
    const [platform, isDark] = useMemo(() => {
        let platform = 'base';
        const isDark = false;
        try {
            const lp = retrieveLaunchParams();
            platform = lp.tgWebAppPlatform;
        } catch {
            /* empty */
        }

        return [platform, isDark];
    }, []);
    return (
        <AppRoot
            appearance={isDark ? 'dark' : 'light'}
            platform={['macos', 'ios'].includes(platform) ? 'ios' : 'base'}
        >
            <Placeholder
                header="Тюленева 25, Музыкальная студия"
                // description="Приложение было запущено из неподдерживаемой платформы, попробуйте обновить приложение Telegram"
            >
                <div>
                    <img src={poster} alt={'Тюленева 25'} style={{ maxWidth: '100%' }} />
                </div>
            </Placeholder>
        </AppRoot>
    );
};
