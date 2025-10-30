import {
    backButton,
    viewport,
    themeParams,
    miniApp,
    initData,
    init as initSDK, locationManager,
} from '@telegram-apps/sdk-react';

/**
 * Initializes the application and configures its dependencies.
 */
export function init(): void {
    initSDK();

    if (!backButton.isSupported() || !miniApp.isSupported()) {
        throw new Error('ERR_NOT_SUPPORTED');
    }

    backButton.mount();
    miniApp.mountSync();
    themeParams.mountSync();
    locationManager.mount();
    initData.restore();
    void viewport
        .mount()
        .catch((e) => {
            console.error('Something went wrong mounting the viewport', e);
        })
        .then(() => {
            viewport.bindCssVars();
            viewport.expand();
        });

    // Define components-related CSS variables.
    miniApp.bindCssVars();
    themeParams.bindCssVars();
}
