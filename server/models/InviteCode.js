const mongoose = require('mongoose');

/**
 * Срок жизни инвайт-кода (24 часа в секундах).
 */
const INVITE_CODE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Схема одноразового инвайт-кода.
 * Код генерируется администратором и может быть использован один раз для запроса доступа.
 * Неиспользованные коды автоматически удаляются MongoDB через TTL-индекс по полю expiresAt.
 */
const inviteCodeSchema = new mongoose.Schema({
    /** Уникальный код приглашения */
    code: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    /** ID администратора, создавшего код */
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    /** Дата автоматического удаления записи (TTL) */
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
}, { timestamps: true });

module.exports = mongoose.model('InviteCode', inviteCodeSchema);
module.exports.INVITE_CODE_TTL_SECONDS = INVITE_CODE_TTL_SECONDS;
