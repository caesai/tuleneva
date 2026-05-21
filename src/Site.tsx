import React, { useMemo } from 'react';
import { Placeholder, AppRoot } from '@telegram-apps/telegram-ui';
import { useSafeLaunchParams } from '@/telegram/useSafeLaunchParams.ts';
import poster from '/Logo_Big_003.jpg';

export const Site: React.FC = () => {
    const { launchParams: lp } = useSafeLaunchParams();
    const [platform, isDark] = useMemo((): ['base' | 'ios', boolean] => {
        const isDark = false;
        const platform: 'base' | 'ios' = ['macos', 'ios'].includes(lp.tgWebAppPlatform)
            ? 'ios'
            : 'base';
        return [platform, isDark];
    }, [lp.tgWebAppPlatform]);
    return (
        <AppRoot
            appearance={isDark ? 'dark' : 'light'}
            platform={platform}
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
