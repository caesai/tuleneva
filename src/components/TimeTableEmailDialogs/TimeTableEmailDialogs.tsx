import { EmailAuthForm } from '@/components/EmailAuthForm/EmailAuthForm.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import css from '@/components/TimeTableEmailDialogs/TimeTableEmailDialogs.module.css';
import type { TTimeTableEmailAuthState } from '@/hooks/useTimeTableEmailAuth.ts';

/**
 * Окна входа, сброса пароля и привязки почты на странице расписания.
 * Кнопка-конверт остаётся в карточке календаря и вызывает openEmailLink.
 * @param props Состояние хука почтовых окон
 * @returns Модалки и кнопка «Войти по почте»
 */
export const TimeTableEmailDialogs = ({ auth }: { auth: TTimeTableEmailAuthState }) => (
    <>
        <ModalPopup
            isOpen={auth.isEmailLoginOpen}
            onClose={() => {
                auth.setIsEmailLoginOpen(false);
                auth.setForgotMode(false);
            }}
        >
            <div className={css.emailLoginModal}>
                <h3 className={css.emailLoginTitle}>
                    {auth.forgotMode ? 'Сброс пароля' : 'Вход по почте'}
                </h3>
                <p className={css.emailLoginHint}>
                    {auth.forgotMode
                        ? 'Если почта привязана, пришлём ссылку для нового пароля.'
                        : 'Тот же аккаунт, что в Telegram-приложении, после привязки почты.'}
                </p>
                {auth.forgotMode ? (
                    <EmailAuthForm
                        mode="forgot"
                        loading={auth.forgotLoading}
                        onBack={() => auth.setForgotMode(false)}
                        onSubmit={async ({ email }) => {
                            if (!email) return;
                            auth.setForgotLoading(true);
                            try {
                                await auth.requestPasswordReset(email);
                                auth.showToast(
                                    'Если почта зарегистрирована, письмо уже отправлено.',
                                    'success',
                                );
                                auth.setForgotMode(false);
                            } catch (err) {
                                auth.showToast(
                                    err instanceof Error
                                        ? err.message
                                        : 'Не удалось отправить письмо.',
                                    'error',
                                );
                                throw err;
                            } finally {
                                auth.setForgotLoading(false);
                            }
                        }}
                    />
                ) : (
                    <EmailAuthForm
                        mode="login"
                        loading={auth.emailLoginLoading}
                        onForgotClick={() => auth.setForgotMode(true)}
                        onSubmit={async ({ email, password }) => {
                            if (!email || !password) return;
                            auth.setEmailLoginLoading(true);
                            try {
                                await auth.loginWithEmailPassword(email, password);
                                auth.showToast('Вход выполнен.', 'success');
                                auth.setIsEmailLoginOpen(false);
                            } catch (err) {
                                auth.showToast(
                                    err instanceof Error
                                        ? err.message
                                        : 'Не удалось войти.',
                                    'error',
                                );
                                throw err;
                            } finally {
                                auth.setEmailLoginLoading(false);
                            }
                        }}
                    />
                )}
            </div>
        </ModalPopup>

        <ModalPopup
            isOpen={auth.isPasswordResetOpen}
            onClose={() => {
                auth.setIsPasswordResetOpen(false);
                auth.setPasswordResetToken(null);
            }}
        >
            <div className={css.emailLoginModal}>
                <h3 className={css.emailLoginTitle}>Новый пароль</h3>
                <p className={css.emailLoginHint}>
                    Задайте пароль не короче 8 символов.
                </p>
                <EmailAuthForm
                    mode="reset"
                    loading={auth.passwordResetLoading}
                    onSubmit={async ({ password }) => {
                        if (!auth.passwordResetToken || !password) return;
                        auth.setPasswordResetLoading(true);
                        try {
                            await auth.resetPasswordWithToken(auth.passwordResetToken, password);
                            auth.showToast('Пароль обновлён, вход выполнен.', 'success');
                            auth.setIsPasswordResetOpen(false);
                            auth.setPasswordResetToken(null);
                        } catch (err) {
                            auth.showToast(
                                err instanceof Error
                                    ? err.message
                                    : 'Не удалось сбросить пароль.',
                                'error',
                            );
                            throw err;
                        } finally {
                            auth.setPasswordResetLoading(false);
                        }
                    }}
                />
            </div>
        </ModalPopup>

        {auth.showEmailLoginButton && (
            <div className={css.emailLoginBar}>
                <button
                    type="button"
                    className={css.emailLoginOpenButton}
                    onClick={() => auth.setIsEmailLoginOpen(true)}
                >
                    Войти по почте
                </button>
            </div>
        )}

        <ModalPopup
            isOpen={auth.showLinkDialog}
            onClose={() => auth.setIsEmailLinkOpen(false)}
        >
            <div className={css.emailLoginModal}>
                <h3 className={css.emailLoginTitle}>Вход в браузере</h3>
                <p className={css.emailLoginHint}>
                    {auth.user?.emailLogin
                        ? `Привязана почта ${auth.user.emailLogin}. Новый адрес нужно подтвердить письмом.`
                        : 'Привяжите почту — ссылка подтверждения придёт на неё.'}
                </p>
                <EmailAuthForm
                    mode="link"
                    compact
                    submitLabel={auth.user?.emailLogin ? 'Сохранить' : 'Привязать'}
                    defaultEmail={auth.user?.emailLogin || ''}
                    loading={auth.emailLinkLoading}
                    requireCurrentPassword={!!auth.user?.emailLogin}
                    onSubmit={async ({ email, password, currentPassword }) => {
                        if (!email || !password) return;
                        auth.setEmailLinkLoading(true);
                        try {
                            const result = await auth.linkEmailPassword(
                                email,
                                password,
                                currentPassword,
                            );
                            if (result.pendingConfirmation) {
                                auth.showToast(
                                    'Проверьте почту — перейдите по ссылке для подтверждения.',
                                    'success',
                                );
                            } else {
                                auth.showToast('Пароль для входа обновлён.', 'success');
                            }
                            auth.setIsEmailLinkOpen(false);
                        } catch (err) {
                            auth.showToast(
                                err instanceof Error ? err.message : 'Не удалось сохранить.',
                                'error',
                            );
                            throw err;
                        } finally {
                            auth.setEmailLinkLoading(false);
                        }
                    }}
                />
            </div>
        </ModalPopup>
    </>
);
