import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailAuthForm } from './EmailAuthForm.tsx';

describe('EmailAuthForm', () => {
    it('submits email and password when valid', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(<EmailAuthForm submitLabel="Войти" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'password12');
        await user.click(screen.getByRole('button', { name: 'Войти' }));

        expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'password12', undefined);
    });

    it('shows error when password is too short', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(<EmailAuthForm submitLabel="Войти" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'short');
        await user.click(screen.getByRole('button', { name: 'Войти' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Пароль не короче 8');
    });

    it('requires current password when enabled', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <EmailAuthForm
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

        expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'password12', 'oldpass12');
    });

    it('keeps password when onSubmit rejects', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn().mockRejectedValue(new Error('Сервер недоступен'));

        render(<EmailAuthForm submitLabel="Войти" onSubmit={onSubmit} />);

        await user.type(screen.getByLabelText('Почта'), 'a@b.co');
        await user.type(screen.getByLabelText('Пароль'), 'password12');
        await user.click(screen.getByRole('button', { name: 'Войти' }));

        expect(screen.getByLabelText('Пароль')).toHaveValue('password12');
        expect(screen.getByRole('alert')).toHaveTextContent('Сервер недоступен');
    });
});
