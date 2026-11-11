import type { FC, ReactNode } from 'react';
import { useDeferredSkeleton } from '@/hooks/useDeferredSkeleton';
import { FadeIn } from './FadeIn';
import css from './skeleton.module.css';

interface ISkeletonSlotProps {
    /** Ждём первую порцию данных. Повторный запрос при уже показанном содержимом — false. */
    pending: boolean;
    /** Подпись для скринридера */
    label: string;
    skeleton: ReactNode;
    children?: ReactNode;
}

/**
 * Держит место скелетом. Первые ~180 мс скелет скрыт, но занимает ту же высоту,
 * чтобы быстрый ответ не мигал и страница не прыгала. Пока pending ложь, остаётся прежнее содержимое.
 * @param props Состояние ожидания и макет скелета
 */
export const SkeletonSlot: FC<ISkeletonSlotProps> = ({ pending, label, skeleton, children = null }) => {
    const show = useDeferredSkeleton(pending);
    if (!pending) {
        return <FadeIn>{children}</FadeIn>;
    }
    return (
        <div aria-busy="true" aria-label={label} className={show ? undefined : css.hold}>
            {skeleton}
        </div>
    );
};
