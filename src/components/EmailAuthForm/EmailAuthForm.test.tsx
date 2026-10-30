import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailAuthForm } from './EmailAuthForm.tsx';

describe('EmailAuthForm', () => {
    it('submits email and password in login mode', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(<EmailAuthForm mode="login" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'password12');
        await user.click(screen.getByRole('button', { name: 'Войти' }));

        expect(onSubmit).toHaveBeenCalledWith({
            email: 'a@b.co',
            password: 'password12',
            currentPassword: undefined,
        });
    });

    it('shows error when password is too short', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(<EmailAuthForm mode="login" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'short');
        await user.click(screen.getByRole('button', { name: 'Войти' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Пароль не короче 8');
    });

    it('requires current password when enabled in link mode', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <EmailAuthForm
                mode="link"
                submitLabel="Сохранить"
                requireCurrentPassword
                onSubmit={onSubmit}
            />,
        );

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'password12');
        await user.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Укажите текущий пароль');

        await user.type(screen.getByLabelText('Текущий пароль'), 'oldpass12');
        await user.click(screen.getByRole('button', { name: 'Сохранить' }));

        expect(onSubmit).toHaveBeenCalledWith({
            email: 'a@b.co',
            password: 'password12',
            currentPassword: 'oldpass12',
        });
    });

    it('keeps password when onSubmit rejects', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockRejectedValue(new Error('Сервер недоступен'));

        render(<EmailAuthForm mode="login" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'password12');
        await user.click(screen.getByRole('button', { name: 'Войти' }));

        expect(screen.getByLabelText('Пароль')).toHaveValue('password12');
        expect(screen.getByRole('alert')).toHaveTextContent('Сервер недоступен');
    });

    it('submits only email in forgot mode', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <EmailAuthForm
                mode="forgot"
                onSubmit={onSubmit}
                onBack={() => undefined}
            />,
        );

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

        expect(onSubmit).toHaveBeenCalledWith({
            email: 'a@b.co',
            password: undefined,
            currentPassword: undefined,
        });
    });

    it('requires matching passwords in reset mode', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(<EmailAuthForm mode="reset" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Новый пароль'), 'password12');
        await user.type(screen.getByLabelText('Повторите пароль'), 'password99');
        await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Пароли не совпадают');
    });
});
