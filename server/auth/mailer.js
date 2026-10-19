const nodemailer = require('nodemailer');

/**
 * Создаёт функцию отправки писем через SMTP из env.
 * Без SMTP_HOST возвращает null (отправка недоступна).
 * @returns {((options: { to: string, subject: string, text: string, html?: string }) => Promise<void>)|null}
 */
const createSmtpSendMail = () => {
    const host = process.env.SMTP_HOST;
    if (!host) {
        return null;
    }

    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM || user || 'noreply@localhost';

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
    });

    /**
     * Отправляет письмо.
     * @param {{ to: string, subject: string, text: string, html?: string }} options
     * @returns {Promise<void>}
     */
    return async ({ to, subject, text, html }) => {
        await transporter.sendMail({
            from,
            to,
            subject,
            text,
            html: html || text,
        });
    };
};

module.exports = {
    createSmtpSendMail,
};
