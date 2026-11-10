/**
 * @file Верхняя граница ошибок: белый экран без лоадера больше не остаётся пустым.
 */
import React, { type ReactNode } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { isChunkLoadError, reloadOnceForChunkError } from '@/boot/chunkReload.ts';
import css from './AppErrorBoundary.module.css';

interface IAppErrorBoundaryProps {
    children: ReactNode;
}

interface IAppErrorBoundaryState {
    hasError: boolean;
    /** Чанк не скачался, документ уже перезагружается — держим лоадер. */
    reloading: boolean;
}

/**
 * Ловит падение рендера и отклонённый lazy-import.
 * Для битого чанка один раз обновляет страницу; иначе показывает «Обновить».
 */
export class AppErrorBoundary extends React.Component<
    IAppErrorBoundaryProps,
    IAppErrorBoundaryState
> {
    state: IAppErrorBoundaryState = { hasError: false, reloading: false };

    static getDerivedStateFromError(error: unknown): IAppErrorBoundaryState {
        const reloading = isChunkLoadError(error) && reloadOnceForChunkError();
        return { hasError: true, reloading };
    }

    componentDidCatch(error: unknown): void {
        console.warn('Экран приложения не собрался:', error);
    }

    render(): ReactNode {
        if (this.state.reloading) {
            return <Loader fullScreen />;
        }
        if (this.state.hasError) {
            return (
                <div className={css.screen} role="alert">
                    <p className={css.message}>Не удалось открыть приложение.</p>
                    <button
                        type="button"
                        className={css.button}
                        onClick={() => window.location.reload()}
                    >
                        Обновить
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
