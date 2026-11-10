/**
 * @file Нейтральный экран /app для человека, которого нет в списке пользователей.
 */
import css from './StudioClosedScreen.module.css';

/**
 * Короткая заглушка без календаря, слотов и подсказок по часам.
 * @returns Разметка экрана
 */
export const StudioClosedScreen = () => (
    <section className={css.screen} aria-labelledby="studio-closed-title">
        <h1 id="studio-closed-title" className={css.title}>Запись по приглашению</h1>
        <p className={css.line}>Доступ открывает администратор студии.</p>
    </section>
);
